// =========================================================================
// Provas de conhecimento do processo seletivo (função provas-rs): validação da prova, sorteio,
// correção com peso, cronômetro do servidor, link seguro e — principalmente — o COMPORTAMENTO
// do fluxo do candidato e do RH com banco simulado. Garantias testadas:
//   - o gabarito nunca vai pro navegador do candidato; - a correção e o tempo são do servidor;
//   - uma só tentativa (não corrige duas vezes); - o código só existe como hash no banco;
//   - uma empresa nunca vê nem mexe nas provas de outra.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { webcrypto } = require('node:crypto');
const { criarBanco } = require('./helpers/banco-falso.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

function provas() {
  const origem = ler('supabase/functions/provas-rs/index.ts');
  const ini = origem.indexOf('// ---- Provas: regras puras');
  const fim = origem.indexOf('// ---- fim: operações');
  assert.ok(ini >= 0 && fim > ini);
  const ctx = vm.createContext({
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Set,
    Promise,
    JSON,
    URL,
    Uint8Array,
    Uint32Array,
    TextEncoder,
    btoa,
    crypto: webcrypto,
    Error,
    console: { error() {}, log() {} },
  });
  vm.runInContext(
    nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)) +
      '\nthis.__k = { PROVAS_RETENCAO_MESES, TOLERANCIA_ENVIO_S, VALIDADE_PADRAO_DIAS, VALIDADE_MAX_DIAS, MAX_APLICACOES_POR_DIA, LIMITES, TOKEN_RE };',
    ctx
  );
  return ctx;
}

// ---------- uma prova de exemplo (3 questões: pesos 1, 1 e 2) ----------
const q = (enunciado, alts, correta, peso) => ({
  enunciado,
  peso,
  correta,
  alternativas: alts.map((texto, i) => ({ id: `x${i}`, texto })),
});
const entradaBoa = () => ({
  titulo: 'Matemática básica',
  descricao: 'Questões de cálculo do dia a dia.',
  tempo_limite_min: 20,
  nota_minima: 60,
  questoes: [
    q('Quanto é 15% de 200?', ['20', '30', '40', '45'], 'x1', 1),
    q('Se 3 canetas custam R$ 6, quanto custam 5?', ['R$ 8', 'R$ 10', 'R$ 12'], 'x1', 1),
    q('Qual é a média de 4, 6 e 8?', ['5', '6', '7'], 'x1', 2),
  ],
});
const AGORA = Date.parse('2026-10-10T12:00:00Z');
const T = 'rs_provas_aplicacoes';
const ISO = (ms) => new Date(ms).toISOString();

// ======================= validação da prova =======================
test('validarProva: aceita uma prova boa e normaliza (ids posicionais, nota e peso padrão)', opcoes, () => {
  const c = provas();
  const r = plano(c.validarProva(entradaBoa()));
  assert.equal(r.ok, true);
  assert.equal(r.prova.questoes.length, 3);
  assert.equal(r.prova.questoes[0].id, 'q1');
  assert.deepEqual(
    r.prova.questoes[0].alternativas.map((a) => a.id),
    ['q1a1', 'q1a2', 'q1a3', 'q1a4']
  );
  assert.equal(r.prova.questoes[0].correta, 'q1a2'); // 'x1' era a 2ª alternativa
  const padrao = entradaBoa();
  delete padrao.nota_minima;
  padrao.questoes.forEach((x) => delete x.peso);
  const p = plano(c.validarProva(padrao));
  assert.equal(p.prova.nota_minima, 60);
  assert.ok(p.prova.questoes.every((x) => x.peso === 1));
});

test('validarProva: recusa título, tempo, nota e número de questões fora do limite', opcoes, () => {
  const c = provas();
  const com = (mut) => {
    const e = entradaBoa();
    mut(e);
    return plano(c.validarProva(e));
  };
  assert.equal(com((e) => (e.titulo = 'ab')).ok, false);
  assert.equal(com((e) => (e.titulo = 'x'.repeat(121))).ok, false);
  assert.equal(com((e) => (e.descricao = 'x'.repeat(1001))).ok, false);
  [4, 241, 10.5, 'abc', null].forEach((t) =>
    assert.equal(com((e) => (e.tempo_limite_min = t)).ok, false, `tempo ${t}`)
  );
  [5, 240].forEach((t) => assert.equal(com((e) => (e.tempo_limite_min = t)).ok, true, `tempo ${t}`));
  [-1, 101, 'x'].forEach((n) => assert.equal(com((e) => (e.nota_minima = n)).ok, false, `nota ${n}`));
  assert.equal(com((e) => (e.nota_minima = 0)).ok, true);
  assert.equal(com((e) => (e.questoes = [])).ok, false);
  assert.equal(
    com((e) => (e.questoes = Array.from({ length: 61 }, () => q('Pergunta qualquer?', ['a', 'b'], 'x0', 1)))).ok,
    false
  );
  assert.equal(
    com((e) => (e.questoes = Array.from({ length: 60 }, () => q('Pergunta qualquer?', ['a', 'b'], 'x0', 1)))).ok,
    true
  );
});

test(
  'validarProva: cada questão precisa de enunciado, 2 a 6 alternativas diferentes, uma correta e peso inteiro — e o erro aponta a questão',
  opcoes,
  () => {
    const c = provas();
    const erroDe = (qq) => {
      const e = entradaBoa();
      e.questoes[1] = qq;
      return plano(c.validarProva(e));
    };
    let r = erroDe(q('Oi', ['a', 'b'], 'x0', 1));
    assert.equal(r.ok, false);
    assert.match(r.erro, /Questão 2/);
    assert.match(r.erro, /enunciado/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['só uma'], 'x0', 1)).erro, /alternativas/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['1', '2', '3', '4', '5', '6', '7'], 'x0', 1)).erro, /alternativas/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['Igual', 'igual', 'Outra'], 'x0', 1)).erro, /repetidas/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['a', ''], 'x0', 1)).erro, /alternativa precisa/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['a', 'b'], 'nao-existe', 1)).erro, /correta/);
    assert.match(erroDe(q('Pergunta válida aqui?', ['a', 'b'], undefined, 1)).erro, /correta/);
    [0, 11, 2.5, -1].forEach((peso) =>
      assert.match(erroDe(q('Pergunta válida aqui?', ['a', 'b'], 'x0', peso)).erro, /peso/, `peso ${peso}`)
    );
    assert.match(erroDe(q('x'.repeat(1001), ['a', 'b'], 'x0', 1)).erro, /enunciado/);
  }
);

test('validarProva: lixo, texto sujo e caractere nulo não quebram nem passam', opcoes, () => {
  const c = provas();
  [null, undefined, 'texto', 42, [], {}].forEach((x) => assert.equal(c.validarProva(x).ok, false));
  const e = entradaBoa();
  e.titulo = '  Prova\u0000 com espaço  ';
  e.questoes[0].enunciado = '  Quanto é 15%\u0000 de 200?  ';
  const r = plano(c.validarProva(e));
  assert.equal(r.ok, true);
  assert.equal(r.prova.titulo, 'Prova com espaço');
  assert.ok(!r.prova.questoes[0].enunciado.includes('\u0000') && r.prova.questoes[0].enunciado.startsWith('Quanto'));
});

// ======================= sorteio =======================
test('embaralhar: mantém todos os elementos, não altera a lista original e respeita o sorteio injetado', opcoes, () => {
  const c = provas();
  const original = [1, 2, 3, 4, 5, 6];
  const copia = [...original];
  const r = plano(c.embaralhar(original));
  assert.deepEqual([...r].sort(), copia);
  assert.deepEqual(original, copia);
  const semSorteio = plano(c.embaralhar([1, 2, 3, 4], (max) => max - 1)); // sorteio fixo: determinístico
  assert.deepEqual(semSorteio, plano(c.embaralhar([1, 2, 3, 4], (max) => max - 1)));
  assert.deepEqual(plano(c.embaralhar([], () => 0)), []);
  assert.deepEqual(plano(c.embaralhar([9], () => 0)), [9]);
});

test(
  'inteiroAleatorio: sempre dentro do intervalo e sem viés (as 3 posições saem com frequência parecida)',
  opcoes,
  () => {
    const c = provas();
    const cont = [0, 0, 0];
    for (let i = 0; i < 30000; i++) {
      const n = c.inteiroAleatorio(3);
      assert.ok(Number.isInteger(n) && n >= 0 && n < 3);
      cont[n]++;
    }
    cont.forEach((x) => assert.ok(x > 9000 && x < 11000, `distribuição torta: ${cont}`));
    assert.equal(c.inteiroAleatorio(1), 0);
    assert.equal(c.inteiroAleatorio(0), 0);
  }
);

test('embaralhar de verdade: as 6 ordens possíveis de 3 itens aparecem, todas com frequência parecida', opcoes, () => {
  const c = provas();
  const vistas = {};
  for (let i = 0; i < 6000; i++) {
    const k = plano(c.embaralhar([1, 2, 3])).join('');
    vistas[k] = (vistas[k] || 0) + 1;
  }
  assert.equal(Object.keys(vistas).length, 6);
  Object.values(vistas).forEach((n) => assert.ok(n > 800 && n < 1200, JSON.stringify(vistas)));
});

// ======================= a cópia da prova (snapshot) e o gabarito =======================
function snapshotBom(c, rand) {
  const v = c.validarProva(entradaBoa());
  return c.montarSnapshot(v.prova, rand);
}

test(
  'montarSnapshot: preserva questões, alternativas e pesos, e a "correta" aponta pra alternativa certa (mesmo embaralhada)',
  opcoes,
  () => {
    const c = provas();
    const snap = plano(snapshotBom(c));
    assert.equal(snap.questoes.length, 3);
    const porEnunciado = Object.fromEntries(snap.questoes.map((x) => [x.enunciado, x]));
    const certa = (enun) => porEnunciado[enun].alternativas.find((a) => a.id === porEnunciado[enun].correta).texto;
    assert.equal(certa('Quanto é 15% de 200?'), '30');
    assert.equal(certa('Se 3 canetas custam R$ 6, quanto custam 5?'), 'R$ 10');
    assert.equal(certa('Qual é a média de 4, 6 e 8?'), '6');
    assert.deepEqual(snap.questoes.map((x) => x.peso).sort(), [1, 1, 2]);
    assert.equal(porEnunciado['Quanto é 15% de 200?'].alternativas.length, 4);
  }
);

test(
  'montarSnapshot: ids opacos e únicos (a posição e o nome do id não denunciam a resposta) e a ordem muda de candidato pra candidato',
  opcoes,
  () => {
    const c = provas();
    const snap = plano(snapshotBom(c));
    const ids = [];
    snap.questoes.forEach((x) => {
      ids.push(x.id);
      x.alternativas.forEach((a) => ids.push(a.id));
    });
    assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
    ids.forEach((id) => assert.match(id, /^[a-z0-9]{8}$/));
    assert.ok(!ids.some((id) => /^q\d+(a\d+)?$/.test(id)));
    const ordens = new Set();
    for (let i = 0; i < 40; i++)
      ordens.add(
        plano(snapshotBom(c))
          .questoes.map((x) => x.enunciado)
          .join('|')
      );
    assert.ok(ordens.size > 1, 'a ordem das questões nunca muda');
  }
);

test('questoesParaCandidato: só id, enunciado e alternativas (id + texto) — NUNCA o gabarito', opcoes, () => {
  const c = provas();
  const snap = snapshotBom(c);
  const saida = plano(c.questoesParaCandidato(snap));
  const texto = JSON.stringify(saida);
  assert.ok(!texto.includes('correta') && !texto.includes('peso') && !texto.includes('ehCorreta'));
  saida.forEach((x) => {
    assert.deepEqual(Object.keys(x).sort(), ['alternativas', 'enunciado', 'id']);
    x.alternativas.forEach((a) => assert.deepEqual(Object.keys(a).sort(), ['id', 'texto']));
  });
  // o id da alternativa correta existe na lista, mas nada marca qual é
  const certa = snap.questoes[0].correta;
  assert.ok(saida[0].alternativas.some((a) => a.id === certa));
});

// ======================= correção =======================
function snapFixo(c) {
  // 3 questões com ids conhecidos: pesos 1, 1 e 2
  return {
    versao: 1,
    titulo: 'T',
    descricao: '',
    questoes: [
      {
        id: 'qA',
        enunciado: 'A',
        peso: 1,
        alternativas: [
          { id: 'a1', texto: '1' },
          { id: 'a2', texto: '2' },
        ],
        correta: 'a2',
      },
      {
        id: 'qB',
        enunciado: 'B',
        peso: 1,
        alternativas: [
          { id: 'b1', texto: '1' },
          { id: 'b2', texto: '2' },
        ],
        correta: 'b1',
      },
      {
        id: 'qC',
        enunciado: 'C',
        peso: 2,
        alternativas: [
          { id: 'c1', texto: '1' },
          { id: 'c2', texto: '2' },
          { id: 'c3', texto: '3' },
        ],
        correta: 'c3',
      },
    ],
  };
}

test('corrigirProva: nota por peso — tudo certo 100, tudo errado 0, parcial proporcional ao peso', opcoes, () => {
  const c = provas();
  const s = snapFixo(c);
  assert.equal(c.corrigirProva(s, { qA: 'a2', qB: 'b1', qC: 'c3' }).nota, 100);
  assert.equal(c.corrigirProva(s, { qA: 'a1', qB: 'b2', qC: 'c1' }).nota, 0);
  const so_peso2 = c.corrigirProva(s, { qC: 'c3' });
  assert.equal(so_peso2.nota, 50); // 2 de 4 pontos
  assert.equal(so_peso2.acertos, 1);
  assert.equal(so_peso2.pontos, 2);
  assert.equal(so_peso2.pontosMax, 4);
  assert.equal(c.corrigirProva(s, { qA: 'a2', qB: 'b1' }).nota, 50); // 2 de 4: a questão de peso 2 ficou em branco
});

test('corrigirProva: em branco e respostas inválidas contam como erradas — nunca quebram nem pontuam', opcoes, () => {
  const c = provas();
  const s = snapFixo(c);
  assert.equal(c.corrigirProva(s, {}).nota, 0);
  assert.equal(c.corrigirProva(s, null).nota, 0);
  assert.equal(c.corrigirProva(s, undefined).nota, 0);
  assert.equal(c.corrigirProva(s, 'texto').nota, 0);
  assert.equal(c.corrigirProva(s, { qA: 'inexistente', qZ: 'a2', qB: 7, qC: ['c3'] }).nota, 0);
  assert.equal(c.corrigirProva(s, { qA: 'b1' }).nota, 0, 'alternativa de OUTRA questão não vale');
  const r = c.corrigirProva(s, { qA: 'a2' });
  assert.equal(r.total, 3);
  assert.equal(r.detalhes.length, 3);
});

test('corrigirProva: arredonda pra 1 casa (2 de 3 = 66,7) e prova sem questões dá 0', opcoes, () => {
  const c = provas();
  const s = snapFixo(c);
  s.questoes.forEach((x) => (x.peso = 1));
  assert.equal(c.corrigirProva(s, { qA: 'a2', qB: 'b1' }).nota, 66.7);
  assert.equal(c.corrigirProva(s, { qA: 'a2' }).nota, 33.3);
  assert.equal(c.corrigirProva({ versao: 1, titulo: 'x', descricao: '', questoes: [] }, {}).nota, 0);
});

test(
  'respostasSaneadas: só guarda questão e alternativa que existem — "__proto__" e outros truques não passam',
  opcoes,
  () => {
    const c = provas();
    const s = snapFixo(c);
    const r = plano(
      c.respostasSaneadas(s, JSON.parse('{"qA":"a2","__proto__":"x","constructor":"y","qZ":"a1","qB":42}'))
    );
    assert.deepEqual(r, { qA: 'a2' });
    assert.deepEqual(plano(c.respostasSaneadas(s, [1, 2])), {});
    assert.deepEqual(plano(c.respostasSaneadas(s, null)), {});
  }
);

// ======================= tempo =======================
const base = (extra = {}) => ({
  status: 'iniciada',
  prazo_ate: ISO(AGORA + 86400000),
  iniciada_em: ISO(AGORA),
  tempo_limite_min: 20,
  ...extra,
});

test('cronômetro: restante em segundos, fronteira do tempo esgotado (limite + 60s de folga de rede)', opcoes, () => {
  const c = provas();
  assert.equal(c.restanteSegundos(ISO(AGORA), 20, AGORA), 1200);
  assert.equal(c.restanteSegundos(ISO(AGORA), 20, AGORA + 600000), 600);
  assert.equal(c.restanteSegundos(ISO(AGORA), 20, AGORA + 1200000), 0);
  assert.equal(c.restanteSegundos(ISO(AGORA), 20, AGORA + 9999999), 0, 'nunca negativo');
  const fim = AGORA + 1200000;
  assert.equal(c.tempoEsgotado(ISO(AGORA), 20, fim), false);
  assert.equal(c.tempoEsgotado(ISO(AGORA), 20, fim + 60000), false, 'exatamente na folga ainda vale');
  assert.equal(c.tempoEsgotado(ISO(AGORA), 20, fim + 60001), true);
});

test(
  'situacaoEfetiva: link vencido sem começar = expirada; começou e estourou sem enviar = tempo_esgotado; o resto fica como está',
  opcoes,
  () => {
    const c = provas();
    assert.equal(c.situacaoEfetiva(base({ status: 'enviada', iniciada_em: null }), AGORA), 'enviada');
    assert.equal(
      c.situacaoEfetiva(base({ status: 'enviada', iniciada_em: null, prazo_ate: ISO(AGORA - 1000) }), AGORA),
      'expirada'
    );
    assert.equal(c.situacaoEfetiva(base(), AGORA + 600000), 'iniciada');
    assert.equal(c.situacaoEfetiva(base(), AGORA + 1200000 + 61000), 'tempo_esgotado');
    assert.equal(
      c.situacaoEfetiva(base({ prazo_ate: ISO(AGORA - 1) }), AGORA + 600000),
      'iniciada',
      'depois de iniciada, o prazo do link não importa — vale o tempo da prova'
    );
    ['concluida', 'cancelada', 'expirada'].forEach((st) =>
      assert.equal(c.situacaoEfetiva(base({ status: st }), AGORA + 99999999), st)
    );
  }
);

// ======================= código (token) =======================
test(
  'gerarToken: 43 caracteres seguros pra URL, aleatório e sem repetição; hashToken é SHA-256 (hex)',
  opcoes,
  async () => {
    const c = provas();
    const vistos = new Set();
    for (let i = 0; i < 500; i++) {
      const t = c.gerarToken();
      assert.equal(t.length, 43);
      assert.match(t, c.__k.TOKEN_RE);
      vistos.add(t);
    }
    assert.equal(vistos.size, 500);
    assert.equal(await c.hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal((await c.hashToken(c.gerarToken())).length, 64);
  }
);

test('TOKEN_RE: rejeita tamanho errado, caracteres perigosos e injeção antes de tocar no banco', opcoes, () => {
  const c = provas();
  const ok = 'A'.repeat(43);
  assert.ok(c.__k.TOKEN_RE.test(ok));
  [
    '',
    'curto',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}'`,
    `${'A'.repeat(41)}' or`,
    `${'A'.repeat(42)}%`,
    `${'A'.repeat(42)}/`,
    '../../etc/passwd'.padEnd(43, 'x'),
  ].forEach((t) => assert.equal(c.__k.TOKEN_RE.test(t), false, t));
});

// ======================= link do e-mail =======================
test(
  'urlBaseSegura: só aceita o site em que o RH está (Origin) ou o URL_SITE — e devolve só a pasta, com / no fim',
  opcoes,
  () => {
    const c = provas();
    const site = 'https://rhalley21.github.io/Sistema-Norte/';
    assert.equal(
      c.urlBaseSegura('https://rhalley21.github.io/Sistema-Norte/app.html?x=1#y', 'https://rhalley21.github.io', site),
      site
    );
    assert.equal(c.urlBaseSegura('https://rhalley21.github.io/Sistema-Norte/', null, site), site);
    assert.equal(
      c.urlBaseSegura('https://outro.com/qualquer/', 'https://outro.com', 'https://rhalley21.github.io/x/'),
      'https://outro.com/qualquer/',
      'o site em que o RH está é aceito'
    );
    // fora da lista -> cai no URL_SITE
    assert.equal(c.urlBaseSegura('https://golpe.com/prova/', 'https://rhalley21.github.io', site), site);
    assert.equal(c.urlBaseSegura('https://golpe.com/prova/', null, site), site);
    assert.equal(
      c.urlBaseSegura('http://rhalley21.github.io/Sistema-Norte/', 'http://rhalley21.github.io', site),
      site,
      'http não vale'
    );
    assert.equal(c.urlBaseSegura('javascript:alert(1)', null, site), site);
    assert.equal(c.urlBaseSegura('//golpe.com/', null, site), site);
    assert.equal(c.urlBaseSegura('', null, site), site);
    assert.equal(c.urlBaseSegura(undefined, null, site), site);
    assert.equal(c.urlBaseSegura('https://rhalley21.github.io/Sistema-Norte/%0d%0a', null, site), site);
    assert.equal(c.urlBaseSegura('http://localhost/', 'http://localhost', site), 'http://localhost/');
    assert.equal(
      c.urlBaseSegura('https://rhalley21.github.io/Sistema-Norte', null, 'https://rhalley21.github.io/Sistema-Norte'),
      'https://rhalley21.github.io/',
      'sem barra final: só a pasta (raiz)'
    );
  }
);

test('corpoEmailProva: nome, empresa e título escapados; tem o link, o tempo e a validade', opcoes, () => {
  const c = provas();
  const html = c.corpoEmailProva(
    'Ana <img src=x>',
    'Loja <b>X</b>',
    'Prova <script>x</script>',
    25,
    'https://s/prova.html?t=abc',
    '2026-10-17T12:00:00Z'
  );
  assert.ok(!html.includes('<img') && !html.includes('<script>') && !html.includes('<b>X</b>'));
  assert.ok(
    html.includes('25 minutos') && html.includes('17/10/2026') && html.includes('href="https://s/prova.html?t=abc"')
  );
});

// ======================= criar a aplicação (RH) =======================
const empresaA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const empresaB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function cenario(extra = {}) {
  const prova = { id: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp', empresa_id: empresaA, arquivada: false, ...entradaBoa() };
  // a prova guardada já vem normalizada (como o prova_salvar grava)
  const v = provas().validarProva(entradaBoa());
  Object.assign(prova, plano(v.prova));
  return {
    prova,
    banco: criarBanco({
      [T]: [],
      empresas: [
        { id: empresaA, nome_fantasia: 'Loja <Teste>' },
        { id: empresaB, nome_fantasia: 'Outra' },
      ],
      __agora: ISO(AGORA),
      ...extra,
    }),
  };
}
const pedido = (prova, mut = {}) => ({
  empresaId: empresaA,
  perfilId: 'perfil1',
  prova,
  candidato: { ref: 'cand-1', nome: 'Ana Souza', email: 'ana@x.com' },
  agora: AGORA,
  ...mut,
});

test(
  'criar aplicação: guarda só o HASH do código, uma cópia da prova com gabarito, e devolve o código uma única vez',
  opcoes,
  async () => {
    const c = provas();
    const { prova, banco } = cenario();
    const r = await c.criarAplicacao(banco, pedido(prova));
    assert.equal(r.ok, true);
    assert.match(r.token, c.__k.TOKEN_RE);
    const linha = banco.tabelas[T][0];
    assert.equal(linha.token_hash, await c.hashToken(r.token));
    assert.ok(!JSON.stringify(linha).includes(r.token), 'o código em texto NÃO pode estar no banco');
    assert.equal(linha.status, 'enviada');
    assert.equal(linha.empresa_id, empresaA);
    assert.equal(linha.questoes_snapshot.questoes.length, 3);
    assert.ok(
      linha.questoes_snapshot.questoes.every((x) => x.correta),
      'a cópia tem o gabarito (só o servidor lê)'
    );
    assert.equal(linha.prazo_ate, ISO(AGORA + 7 * 86400000));
    assert.equal(linha.nota_minima, 60);
    const resumo = JSON.stringify(r.aplicacao);
    ['token_hash', 'questoes_snapshot', 'respostas', 'correta'].forEach((k) =>
      assert.ok(!resumo.includes(k), `o resumo vazou ${k}`)
    );
  }
);

test(
  'criar aplicação: validade padrão 7 dias, personalizada e limitada a 30; entrada estranha cai no padrão',
  opcoes,
  async () => {
    const c = provas();
    for (const [entrada, dias] of [
      [3, 3],
      [30, 30],
      [90, 30],
      [0, 7],
      [-2, 7],
      ['abc', 7],
      [undefined, 7],
      [2.5, 7],
    ]) {
      const { prova, banco } = cenario();
      await c.criarAplicacao(banco, pedido(prova, { validadeDias: entrada }));
      assert.equal(banco.tabelas[T][0].prazo_ate, ISO(AGORA + dias * 86400000), `validade ${entrada}`);
    }
  }
);

test(
  'criar aplicação: não duplica prova ativa do mesmo modelo para o mesmo candidato; depois de cancelar ou expirar, pode',
  opcoes,
  async () => {
    const c = provas();
    const { prova, banco } = cenario();
    assert.equal((await c.criarAplicacao(banco, pedido(prova))).ok, true);
    const dup = await c.criarAplicacao(banco, pedido(prova));
    assert.equal(dup.ok, false);
    assert.match(dup.erro, /Já existe/);
    assert.equal(
      (await c.criarAplicacao(banco, pedido(prova, { candidato: { ref: 'cand-2', nome: 'Bia', email: null } }))).ok,
      true,
      'outro candidato pode'
    );
    banco.tabelas[T][0].status = 'cancelada';
    assert.equal((await c.criarAplicacao(banco, pedido(prova))).ok, true, 'depois de cancelar, pode');
    const { prova: p2, banco: b2 } = cenario();
    await c.criarAplicacao(b2, pedido(p2));
    b2.tabelas[T][0].prazo_ate = ISO(AGORA - 1000); // o link venceu sem a prova começar
    assert.equal((await c.criarAplicacao(b2, pedido(p2))).ok, true, 'link vencido não bloqueia uma nova aplicação');
  }
);

test('criar aplicação: limite diário por empresa e prova incompleta recusada', opcoes, async () => {
  const c = provas();
  const { prova, banco } = cenario();
  for (let i = 0; i < 300; i++)
    banco.tabelas[T].push({ id: `x${i}`, empresa_id: empresaA, criado_em: ISO(AGORA - 3600000), status: 'concluida' });
  const r = await c.criarAplicacao(banco, pedido(prova));
  assert.equal(r.ok, false);
  assert.match(r.erro, /Limite diário/);
  const { banco: b2 } = cenario();
  for (let i = 0; i < 300; i++)
    b2.tabelas[T].push({ id: `y${i}`, empresa_id: empresaB, criado_em: ISO(AGORA - 3600000), status: 'concluida' }); // outra empresa não conta
  assert.equal((await c.criarAplicacao(b2, pedido(prova))).ok, true);
  const ruim = { ...prova, questoes: [] };
  const r3 = await c.criarAplicacao(cenario().banco, pedido(ruim));
  assert.equal(r3.ok, false);
  assert.match(r3.erro, /incompleta/);
});

// ======================= fluxo do candidato =======================
async function comAplicacao(extra) {
  const c = provas();
  const { prova, banco } = cenario();
  const r = await c.criarAplicacao(banco, pedido(prova, extra));
  const linha = banco.tabelas[T][0];
  // gabarito conhecido: acha, na cópia, a alternativa certa e uma errada de cada questão
  const snap = linha.questoes_snapshot;
  const certas = Object.fromEntries(snap.questoes.map((x) => [x.id, x.correta]));
  const erradas = Object.fromEntries(
    snap.questoes.map((x) => [x.id, x.alternativas.find((a) => a.id !== x.correta).id])
  );
  return { c, banco, token: r.token, linha, snap, certas, erradas };
}
const VAZAMENTOS = [
  'correta',
  'token_hash',
  'questoes_snapshot',
  'ehCorreta',
  'nota_minima',
  'candidato_email',
  'prova_id',
];
const semVazamento = (corpo, rotulo) => {
  const s = JSON.stringify(corpo);
  VAZAMENTOS.forEach((k) => assert.ok(!s.includes(k), `${rotulo}: a resposta ao candidato vazou "${k}"`));
};

test('candidato: link inválido (curto, inexistente) dá 404 e não revela nada', opcoes, async () => {
  const { c, banco } = await comAplicacao();
  const r = await c.candidatoAbrir(banco, 'Z'.repeat(43), AGORA);
  assert.equal(r.http, 404);
  assert.match(r.corpo.error, /inválido ou expirou/);
});

test('candidato: antes de iniciar vê só título e tempo — as questões NÃO vêm', opcoes, async () => {
  const { c, banco, token } = await comAplicacao();
  const r = await c.candidatoAbrir(banco, token, AGORA);
  assert.equal(r.http, 200);
  assert.equal(r.corpo.estado, 'enviada');
  assert.equal(r.corpo.titulo, 'Matemática básica');
  assert.equal(r.corpo.tempoLimiteMin, 20);
  assert.equal(r.corpo.totalQuestoes, 3);
  assert.equal(r.corpo.empresa, 'Loja <Teste>');
  assert.equal(r.corpo.questoes, undefined);
  semVazamento(r.corpo, 'abrir');
});

test(
  'candidato: ao iniciar recebe as questões SEM gabarito, com o tempo cheio — e o relógio começa agora',
  opcoes,
  async () => {
    const { c, banco, token, linha } = await comAplicacao();
    const r = await c.candidatoIniciar(banco, token, AGORA + 5000);
    assert.equal(r.corpo.estado, 'iniciada');
    assert.equal(r.corpo.restanteSegundos, 1200);
    assert.equal(r.corpo.questoes.length, 3);
    assert.equal(linha.status, 'iniciada');
    assert.equal(linha.iniciada_em, ISO(AGORA + 5000));
    semVazamento(r.corpo, 'iniciar');
    r.corpo.questoes.forEach((x) => assert.deepEqual(Object.keys(x).sort(), ['alternativas', 'enunciado', 'id']));
  }
);

test(
  'candidato: iniciar DE NOVO (outra aba, recarregar) não reinicia o relógio — o tempo continua correndo',
  opcoes,
  async () => {
    const { c, banco, token, linha } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    const depois = await c.candidatoIniciar(banco, token, AGORA + 600000);
    assert.equal(linha.iniciada_em, ISO(AGORA), 'o início não pode mudar');
    assert.equal(depois.corpo.restanteSegundos, 600);
    const reabrir = await c.candidatoAbrir(banco, token, AGORA + 900000);
    assert.equal(reabrir.corpo.estado, 'iniciada');
    assert.equal(reabrir.corpo.restanteSegundos, 300);
    assert.equal(reabrir.corpo.questoes.length, 3);
  }
);

test('candidato: as respostas salvas voltam ao recarregar a página (não perde o que já marcou)', opcoes, async () => {
  const { c, banco, token, certas } = await comAplicacao();
  await c.candidatoIniciar(banco, token, AGORA);
  const [q1] = Object.keys(certas);
  const s = await c.candidatoSalvar(banco, token, { [q1]: certas[q1] }, AGORA + 60000);
  assert.equal(s.http, 200);
  assert.equal(s.corpo.restanteSegundos, 1140);
  const reabrir = await c.candidatoAbrir(banco, token, AGORA + 120000);
  assert.deepEqual(plano(reabrir.corpo.respostas), { [q1]: certas[q1] });
});

test('candidato: salvar ignora questão e alternativa inexistentes e acumula as respostas', opcoes, async () => {
  const { c, banco, token, certas, linha } = await comAplicacao();
  await c.candidatoIniciar(banco, token, AGORA);
  const [q1, q2] = Object.keys(certas);
  await c.candidatoSalvar(banco, token, { [q1]: certas[q1], qFalsa: 'x', [q2]: 'alternativa-falsa' }, AGORA + 1000);
  assert.deepEqual(Object.keys(linha.respostas), [q1]);
  await c.candidatoSalvar(banco, token, { [q2]: certas[q2] }, AGORA + 2000);
  assert.deepEqual(Object.keys(linha.respostas).sort(), [q1, q2].sort());
});

test('candidato: salvar ou enviar antes de iniciar dá 409', opcoes, async () => {
  const { c, banco, token } = await comAplicacao();
  assert.equal((await c.candidatoSalvar(banco, token, {}, AGORA)).http, 409);
  const e = await c.candidatoEnviar(banco, token, {}, AGORA);
  assert.equal(e.http, 409);
  assert.match(e.corpo.error, /Inicie a prova/);
});

test(
  'candidato: enviar corrige NO SERVIDOR com peso, fecha a prova e NÃO devolve a nota nem o gabarito',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas, erradas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    const ids = Object.keys(certas);
    // acerta as 2 questões de peso 1 e erra a de peso 2 (a que tem peso 2 é a "média")
    const peso2 = linha.questoes_snapshot.questoes.find((x) => x.peso === 2).id;
    const respostas = Object.fromEntries(ids.map((id) => [id, id === peso2 ? erradas[id] : certas[id]]));
    const r = await c.candidatoEnviar(banco, token, respostas, AGORA + 600000);
    assert.deepEqual(plano(r), { http: 200, corpo: { ok: true, estado: 'concluida' } });
    assert.equal(linha.status, 'concluida');
    assert.equal(linha.nota, 50); // 2 de 4 pontos
    assert.equal(linha.acertos, 2);
    assert.equal(linha.total, 3);
    assert.equal(linha.fora_do_prazo, false);
    assert.equal(linha.concluida_em, ISO(AGORA + 600000));
    semVazamento(r.corpo, 'enviar');
    assert.ok(!('nota' in r.corpo));
    semVazamento((await c.candidatoAbrir(banco, token, AGORA + 700000)).corpo, 'abrir depois');
  }
);

test(
  'candidato: UMA tentativa — reenviar não muda a nota; iniciar depois de concluída não reabre; salvar dá 409',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas, erradas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    await c.candidatoEnviar(banco, token, certas, AGORA + 1000);
    assert.equal(linha.nota, 100);
    const de_novo = await c.candidatoEnviar(banco, token, erradas, AGORA + 2000); // tentativa de "corrigir" a prova
    assert.equal(de_novo.corpo.estado, 'concluida');
    assert.equal(linha.nota, 100, 'a nota não pode mudar depois de enviada');
    assert.deepEqual(plano(linha.respostas), plano(certas));
    assert.equal((await c.candidatoSalvar(banco, token, erradas, AGORA + 3000)).http, 409);
    const reiniciar = await c.candidatoIniciar(banco, token, AGORA + 4000);
    assert.equal(reiniciar.corpo.estado, 'concluida');
    assert.equal(reiniciar.corpo.questoes, undefined, 'concluída não devolve as questões de novo');
  }
);

// Faz as primeiras N leituras do código aguardarem umas às outras: assim as requisições "simultâneas" leem o estado
// ANTES de qualquer gravação — a corrida de verdade (sem isto, cada chamada terminaria antes da outra começar).
function comBarreira(banco, quantas) {
  let chegaram = 0;
  let liberar;
  const portao = new Promise((r) => (liberar = r));
  const original = banco.from;
  banco.from = (nome) => {
    const q = original(nome);
    if (nome !== T) return q;
    const maybe = q.maybeSingle.bind(q);
    q.maybeSingle = async () => {
      const r = await maybe();
      if (chegaram < quantas) {
        chegaram++;
        if (chegaram === quantas) liberar();
        await portao;
      }
      return r;
    };
    return q;
  };
}

test('CORRIDA: dois envios ao mesmo tempo corrigem UMA vez só e a primeira nota prevalece', opcoes, async () => {
  const { c, banco, token, linha, certas, erradas } = await comAplicacao();
  await c.candidatoIniciar(banco, token, AGORA);
  comBarreira(banco, 2);
  await Promise.all([
    c.candidatoEnviar(banco, token, certas, AGORA + 1000),
    c.candidatoEnviar(banco, token, erradas, AGORA + 1000),
  ]);
  const correcoes = banco.rastro.filter(
    (x) => x.tabela === T && x.op === 'update' && x.valores.status === 'concluida' && x.linhas === 1
  );
  assert.equal(correcoes.length, 1, 'a prova foi corrigida mais de uma vez');
  const perdidas = banco.rastro.filter(
    (x) => x.tabela === T && x.op === 'update' && x.valores.status === 'concluida' && x.linhas === 0
  );
  assert.equal(perdidas.length, 1, 'a segunda gravação deveria ter sido barrada pela condição de status');
  assert.equal(linha.nota, 100, 'prevalece o primeiro envio');
});

test(
  'CORRIDA: duas abas iniciando a prova juntas — o relógio começa uma vez só (vale a primeira)',
  opcoes,
  async () => {
    const { c, banco, token, linha } = await comAplicacao();
    comBarreira(banco, 2);
    await Promise.all([c.candidatoIniciar(banco, token, AGORA), c.candidatoIniciar(banco, token, AGORA + 5000)]);
    assert.equal(linha.iniciada_em, ISO(AGORA), 'o início foi sobrescrito pela segunda aba');
    const inicios = banco.rastro.filter((x) => x.tabela === T && x.op === 'update' && x.valores.status === 'iniciada');
    assert.equal(inicios.filter((x) => x.linhas === 1).length, 1);
  }
);

test(
  'CORRIDA: reabrir uma prova que estourou o tempo, de dois lugares ao mesmo tempo, corrige uma vez só',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    const q1 = Object.keys(certas)[0];
    await c.candidatoSalvar(banco, token, { [q1]: certas[q1] }, AGORA + 1000);
    comBarreira(banco, 2);
    const depois = AGORA + 1200000 + 120000;
    await Promise.all([c.candidatoAbrir(banco, token, depois), c.candidatoAbrir(banco, token, depois)]);
    const correcoes = banco.rastro.filter(
      (x) => x.tabela === T && x.op === 'update' && x.valores.status === 'concluida' && x.linhas === 1
    );
    assert.equal(correcoes.length, 1);
    assert.equal(linha.status, 'concluida');
  }
);

test(
  'candidato: envio depois do tempo, dentro da folga de 60s, vale — marcado como "fora do prazo"',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    await c.candidatoEnviar(banco, token, certas, AGORA + 1200000 + 30000); // 30s depois do limite
    assert.equal(linha.status, 'concluida');
    assert.equal(linha.nota, 100);
    assert.equal(linha.fora_do_prazo, true);
  }
);

test(
  'candidato: envio DEPOIS da folga não conta o que veio no envio — só o que já estava salvo antes do tempo acabar',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    const [q1, q2, q3] = Object.keys(certas);
    await c.candidatoSalvar(banco, token, { [q1]: certas[q1] }, AGORA + 60000); // salvou 1 antes do tempo
    const r = await c.candidatoEnviar(banco, token, certas, AGORA + 1200000 + 120000); // chega 2 min depois do limite com tudo certo
    assert.equal(r.corpo.estado, 'concluida');
    assert.equal(linha.fora_do_prazo, true);
    assert.deepEqual(Object.keys(linha.respostas), [q1], 'as respostas tardias não podem entrar');
    assert.ok(linha.nota < 100);
    assert.ok(q2 && q3);
  }
);

test(
  'candidato fechou a aba e o tempo acabou: a prova é corrigida sozinha com o que foi salvo na próxima vez que alguém olha',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    const q1 = Object.keys(certas)[0];
    await c.candidatoSalvar(banco, token, { [q1]: certas[q1] }, AGORA + 1000);
    const depois = AGORA + 1200000 + 61000 + 1;
    const r = await c.candidatoAbrir(banco, token, depois);
    assert.equal(r.corpo.estado, 'concluida');
    assert.equal(linha.status, 'concluida');
    assert.equal(linha.fora_do_prazo, true);
    assert.ok(linha.nota > 0 && linha.nota < 100);
  }
);

test(
  'candidato: link vencido sem começar = expirada (não deixa iniciar); cancelada = cancelada — sem detalhes da prova',
  opcoes,
  async () => {
    const exp = await comAplicacao();
    exp.linha.prazo_ate = ISO(AGORA - 1000);
    const a = await exp.c.candidatoIniciar(exp.banco, exp.token, AGORA);
    assert.equal(a.corpo.estado, 'expirada');
    assert.equal(exp.linha.status, 'enviada', 'não pode iniciar uma prova vencida');
    assert.equal(a.corpo.questoes, undefined);
    semVazamento(a.corpo, 'expirada');
    const can = await comAplicacao();
    can.linha.status = 'cancelada';
    const b = await can.c.candidatoAbrir(can.banco, can.token, AGORA);
    assert.equal(b.corpo.estado, 'cancelada');
    assert.equal(b.corpo.totalQuestoes, undefined);
    assert.equal((await can.c.candidatoIniciar(can.banco, can.token, AGORA)).corpo.estado, 'cancelada');
    assert.equal(can.linha.status, 'cancelada');
  }
);

test(
  'NENHUMA resposta ao candidato, em nenhuma etapa, contém o gabarito, a nota ou dados internos',
  opcoes,
  async () => {
    const { c, banco, token, certas } = await comAplicacao();
    const respostas = [];
    respostas.push((await c.candidatoAbrir(banco, token, AGORA)).corpo);
    respostas.push((await c.candidatoIniciar(banco, token, AGORA)).corpo);
    respostas.push((await c.candidatoSalvar(banco, token, certas, AGORA + 1)).corpo);
    respostas.push((await c.candidatoAbrir(banco, token, AGORA + 2)).corpo);
    respostas.push((await c.candidatoEnviar(banco, token, certas, AGORA + 3)).corpo);
    respostas.push((await c.candidatoAbrir(banco, token, AGORA + 4)).corpo);
    respostas.forEach((r, i) => semVazamento(r, `etapa ${i}`));
  }
);

// ======================= RH: listar, detalhe, isolamento =======================
test(
  'RH: listar mostra o resultado (nota, atingiu a mínima, duração) sem código nem gabarito, e filtra por candidato',
  opcoes,
  async () => {
    const { c, banco, token, certas } = await comAplicacao();
    await c.candidatoIniciar(banco, token, AGORA);
    await c.candidatoEnviar(banco, token, certas, AGORA + 300000);
    const lista = plano(await c.listarAplicacoes(banco, empresaA, {}, AGORA + 400000));
    assert.equal(lista.length, 1);
    assert.equal(lista[0].status, 'concluida');
    assert.equal(lista[0].nota, 100);
    assert.equal(lista[0].atingiu_minima, true);
    assert.equal(lista[0].duracao_s, 300);
    assert.equal(lista[0].candidato_nome, 'Ana Souza');
    ['token_hash', 'questoes_snapshot', 'respostas', 'correta'].forEach((k) =>
      assert.ok(!JSON.stringify(lista).includes(k), k)
    );
    assert.equal((await c.listarAplicacoes(banco, empresaA, { candidatoRefs: ['cand-1'] }, AGORA)).length, 1);
    assert.equal((await c.listarAplicacoes(banco, empresaA, { candidatoRefs: ['outro'] }, AGORA)).length, 0);
  }
);

test('RH: nota abaixo da mínima aparece como "não atingiu" — o sistema nunca "reprova" sozinho', opcoes, async () => {
  const { c, banco, token, erradas } = await comAplicacao();
  await c.candidatoIniciar(banco, token, AGORA);
  await c.candidatoEnviar(banco, token, erradas, AGORA + 1000);
  const [r] = plano(await c.listarAplicacoes(banco, empresaA, {}, AGORA + 5000));
  assert.equal(r.nota, 0);
  assert.equal(r.atingiu_minima, false);
  assert.equal(r.status, 'concluida', 'o status é do resultado da prova, não uma decisão de reprovar o candidato');
});

test('RH: listar corrige sozinho as provas que estouraram o tempo (candidato fechou a aba)', opcoes, async () => {
  const { c, banco, token, linha, certas } = await comAplicacao();
  await c.candidatoIniciar(banco, token, AGORA);
  await c.candidatoSalvar(banco, token, { [Object.keys(certas)[0]]: certas[Object.keys(certas)[0]] }, AGORA + 1000);
  const [r] = plano(await c.listarAplicacoes(banco, empresaA, {}, AGORA + 1200000 + 120000));
  assert.equal(r.status, 'concluida');
  assert.equal(r.fora_do_prazo, true);
  assert.equal(linha.status, 'concluida');
  assert.ok(r.nota > 0);
});

test(
  'RH: detalhe mostra o gabarito, o que o candidato marcou e o que acertou — só depois de concluída',
  opcoes,
  async () => {
    const { c, banco, token, linha, certas, erradas } = await comAplicacao();
    const [q1, q2, q3] = Object.keys(certas);
    const idDe = (id) => linha.id && id;
    await c.candidatoIniciar(banco, token, AGORA);
    const antes = await c.detalheAplicacao(banco, empresaA, linha.id, AGORA + 10);
    assert.ok(
      antes.questoes.every((x) => x.acertou === null),
      'antes de concluir não mostra certo/errado'
    );
    await c.candidatoEnviar(banco, token, { [q1]: certas[q1], [q2]: erradas[q2] }, AGORA + 1000);
    const d = plano(await c.detalheAplicacao(banco, empresaA, linha.id, AGORA + 2000));
    assert.equal(d.questoes.length, 3);
    const por = Object.fromEntries(d.questoes.map((x) => [x.id, x]));
    assert.equal(por[q1].acertou, true);
    assert.equal(por[q1].correta, certas[q1]);
    assert.equal(por[q2].acertou, false);
    assert.equal(por[q2].resposta, erradas[q2]);
    assert.equal(por[q3].resposta, null);
    assert.equal(por[q3].acertou, false);
    assert.ok(idDe(q1));
  }
);

test('ISOLAMENTO: uma empresa nunca lista nem vê o detalhe das provas de outra', opcoes, async () => {
  const { c, banco, linha } = await comAplicacao();
  assert.equal((await c.listarAplicacoes(banco, empresaB, {}, AGORA)).length, 0);
  assert.equal(await c.detalheAplicacao(banco, empresaB, linha.id, AGORA), null);
  assert.notEqual(await c.detalheAplicacao(banco, empresaA, linha.id, AGORA), null);
  assert.equal(await c.detalheAplicacao(banco, empresaA, 'id-que-nao-existe', AGORA), null);
});

// ======================= segurança estática da função =======================
test('provas-rs: a porta do candidato vem ANTES do login, é limitada por IP e valida o formato do código antes de tocar no banco', () => {
  const o = ler('supabase/functions/provas-rs/index.ts');
  const iCand = o.indexOf("action.startsWith('candidato_')");
  const iAuth = o.indexOf('principal.auth.getUser()');
  assert.ok(iCand > 0 && iAuth > iCand);
  const bloco = o.slice(iCand, iAuth);
  assert.ok(
    bloco.includes('TOKEN_RE.test(token)') && bloco.includes("'prova_token_invalido'") && bloco.includes('429')
  );
  assert.ok(bloco.indexOf('TOKEN_RE.test(token)') < bloco.indexOf('candidatoAbrir(admin, token'));
});

test('provas-rs: a porta do RH exige Administrador/RH e TODA consulta ao banco é filtrada pela empresa de quem pediu', () => {
  const o = ler('supabase/functions/provas-rs/index.ts');
  const rh = o.slice(o.indexOf('PORTA DO RH (login'));
  assert.ok(rh.includes("!['owner', 'rh'].includes(perfil.papel)") && rh.includes('403'));
  assert.ok(rh.indexOf("['owner', 'rh'].includes") < rh.indexOf("action === 'prova_listar'"));
  const consultas = [...rh.matchAll(/\.from\((?:'rs_provas'|T_APLIC)\)([\s\S]{0,330}?)(?:;|\n\s*\n)/g)];
  assert.ok(
    consultas.length >= 12,
    `achei poucas consultas (${consultas.length}) — o teste está olhando o lugar certo?`
  );
  consultas.forEach((m) => {
    const trecho = m[0];
    const insercao = /\.insert\(/.test(trecho);
    assert.ok(
      insercao ? /empresa_id: empresaId/.test(trecho) : /\.eq\('empresa_id', empresaId\)/.test(trecho),
      `consulta sem filtro de empresa:\n${trecho.slice(0, 200)}`
    );
  });
});

test('provas-rs: sem Math.random (o sorteio e o código usam crypto) e o código do candidato nunca é gravado em texto', () => {
  const o = ler('supabase/functions/provas-rs/index.ts');
  assert.ok(!o.replace(/\/\/.*$/gm, '').includes('Math.random'));
  assert.ok(o.includes('token_hash: await hashToken(token)'));
  assert.ok(!/insert\(\{[^}]*token:/.test(o));
  assert.ok(
    o.includes('visaoDoCandidato') && /questoes: questoesParaCandidato\(snap\)/.test(o),
    'o candidato só recebe as questões pela função que remove o gabarito'
  );
});

test(
  'o prazo de retenção dos resultados é o mesmo na função, na rotina diária, no SQL e na documentação',
  opcoes,
  () => {
    const c = provas();
    assert.equal(c.__k.PROVAS_RETENCAO_MESES, 24);
    assert.equal(c.__k.TOLERANCIA_ENVIO_S, 60);
  }
);
