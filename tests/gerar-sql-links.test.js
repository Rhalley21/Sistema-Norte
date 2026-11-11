// A ferramenta que gera o SQL dos links de pagamento: confere o valor escrito no fim do endereço e recusa link errado.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { criarBancoReal, ID } = require('./helpers/banco-real.js');

const raiz = path.join(__dirname, '..');
const gerar = (...args) =>
  spawnSync('python3', ['scripts/gerar-sql-links.py', ...args], { cwd: raiz, encoding: 'utf8' });
const L = (v) => `https://link.infinitepay.io/inetris-933/VC1DLTEtSQ-abc123-${v}`;

test('os links de 297, 597 e 997 (primeiro pagamento = só a mensalidade) viram um SQL sem aspas, e o do mesmo plano e tipo é trocado se rodar de novo', () => {
  const r = gerar(
    `essencial:primeira=${L('297,00')}`,
    `gestao:primeira=${L('597,00')}`,
    `estrategico:primeira=${L('997,00')}`
  );
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!/["'‘’“”]/.test(r.stdout.replace(/^--.*$/m, '')), 'sobrou aspa');
  assert.ok(r.stdout.includes('on conflict (plano, tipo) do update'));
  for (const v of ['297,00', '597,00', '997,00']) assert.ok(r.stdout.includes(`-${v}$$`));
});

test('RECUSA o link de OUTRO plano no lugar do certo (o cliente pagaria o valor errado)', () => {
  const r = gerar(`essencial:primeira=${L('597,00')}`);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cobra R\$ 597,00, mas o esperado (é|e) R\$ 297,00/);
  assert.equal(r.stdout, '', 'nada é gerado quando há erro');
  assert.equal(gerar(`gestao:primeira=${L('297,00')}`).status, 1);
  assert.equal(
    gerar(`estrategico:primeira=${L('887,00')}`).status,
    1,
    'o valor antigo (mensalidade + implantação) não vale mais'
  );
});
test('as mensalidades de 297, 597 e 997 são aceitas como tipo "mensalidade"', () => {
  const r = gerar(
    `essencial:mensalidade=${L('297,00')}`,
    `gestao:mensalidade=${L('597,00')}`,
    `estrategico:mensalidade=${L('997,00')}`
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout.match(/mensalidade\$\$/g) || []).length, 3);
});

test('recusa: valor trocado entre planos, sem valor no link, http, espaço, cifrão, plano inventado, repetido, formato errado e vazio', () => {
  const casos = [
    [`gestao:primeira=${L('887,00')}`, /cobra R\$ 887,00/],
    [`essencial:primeira=https://link.infinitepay.io/inetris-933/semvalor`, /nao achei o valor/],
    [`essencial:primeira=${L('887,00').replace('https', 'http')}`, /https/],
    [`essencial:primeira=${L('297,00')} x`, /https/],
    [`essencial:primeira=${L('297,00')}$$`, /cifrao/],
    [`premium:primeira=${L('887,00')}`, /invalido/],
    ['essencial=sem-tipo', /formato/],
    [`essencial:primeira=${L('297,00')}`, null],
  ];
  for (const [arg, esperado] of casos) {
    const r = gerar(arg);
    if (esperado) {
      assert.equal(r.status, 1, arg);
      assert.match(r.stderr, esperado, arg);
    } else assert.equal(r.status, 0, arg);
  }
  assert.equal(gerar(`essencial:primeira=${L('297,00')}`, `essencial:primeira=${L('297,00')}`).status, 1, 'repetido');
  assert.equal(gerar().status, 1, 'sem argumentos');
});

test('o SQL gerado roda num Postgres de verdade com a migração 46, aceita os links e atualiza o link do mesmo plano', async () => {
  const b = await criarBancoReal({ com45: true, com46: true });
  const r1 = gerar(
    `essencial:primeira=${L('297,00')}`,
    `gestao:primeira=${L('597,00')}`,
    `estrategico:primeira=${L('997,00')}`
  );
  await b.dentro(async () => {
    await b.db.exec(r1.stdout);
    assert.equal((await b.ver('select count(*)::int as n from links_pagamento'))[0].n, 3);
    const r2 = gerar(`essencial:primeira=https://link.infinitepay.io/inetris-933/NOVO-297,00`);
    await b.db.exec(r2.stdout);
    const [e] = await b.ver("select url from links_pagamento where plano = 'essencial' and tipo = 'primeira'");
    assert.equal(e.url, 'https://link.infinitepay.io/inetris-933/NOVO-297,00');
    assert.equal((await b.ver('select count(*)::int as n from links_pagamento'))[0].n, 3, 'trocou, não duplicou');
    assert.equal(
      (await b.como(ID.ownerA).q('select * from links_pagamento')).ok,
      false,
      'e nenhum usuário lê a tabela'
    );
  });
});
