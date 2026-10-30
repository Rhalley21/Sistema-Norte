// A versão SEM ASPAS (para colar no Supabase sem o chat trocar as aspas) precisa fazer EXATAMENTE o mesmo que o original.
// Aqui ela é gerada pelo script do repositório e carregada num Postgres de verdade, e a proteção do sql/45 é conferida nela.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');
const { criarBancoReal, ID } = require('./helpers/banco-real.js');

const raiz = path.join(__dirname, '..');
const gerar = (arquivo) =>
  spawnSync('python3', [path.join(raiz, 'scripts', 'sql-sem-aspas.py'), path.join(raiz, 'sql', arquivo)], {
    encoding: 'utf8',
  });

test('a conversão sem aspas funciona para as migrações 44 e 45 e não deixa nenhuma aspa (reta ou curva)', () => {
  for (const arquivo of ['44-dados-sistema-versao.sql', '45-seguranca-papeis.sql']) {
    const r = gerar(arquivo);
    assert.equal(r.status, 0, r.stderr);
    for (const aspa of ["'", '"', '\u2018', '\u2019', '\u201c', '\u201d'])
      assert.ok(!r.stdout.includes(aspa), `${arquivo} ainda tem ${aspa}`);
    assert.ok(r.stdout.includes(`$$${arquivo}$$`), 'continua se registrando com o nome certo');
  }
});

test('a conversão recusa o que não consegue fazer sem aspas (nome de política entre aspas duplas) em vez de gerar um SQL errado', () => {
  const tmp = path.join(require('os').tmpdir(), 'ruim.sql');
  fs.writeFileSync(tmp, 'create policy "acesso por empresa" on t for all using (true);\n');
  const r = spawnSync('python3', [path.join(raiz, 'scripts', 'sql-sem-aspas.py'), tmp], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /aspas duplas/);
});

test('SQL 45 SEM ASPAS carregado num Postgres de verdade: as brechas continuam fechadas e a gravação por área funciona', async () => {
  const sem = gerar('45-seguranca-papeis.sql').stdout;
  const b = await criarBancoReal({ com45: false });
  await b.db.exec(sem);
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`)).negou,
      true
    );
    assert.equal(
      (
        await b
          .como(ID.colabA)
          .q(`insert into convites (empresa_id, codigo, papel) values ('${ID.empresaA}', 'GOLPE', 'rh')`)
      ).negou,
      true
    );
    assert.equal(
      (await b.como(ID.colabA).q(`update dados_sistema set payload = '{}'::jsonb where empresa_id = '${ID.empresaA}'`))
        .negou,
      true
    );
    assert.equal((await b.como(ID.desativadoA).q('select 1 from dados_sistema')).rows.length, 0);
    const v = Number((await b.ver(`select versao from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].versao);
    const r = await b
      .como(ID.colabA)
      .q('select salvar_dados_areas($1::jsonb, $2::bigint) as r', [
        JSON.stringify({ ciclos: [{ id: 'k1', nota: 4 }], empresa: { nome: 'x' } }),
        v,
      ]);
    assert.deepEqual(r.rows[0].r, { conflito: false, versao: v + 1, rejeitadas: ['empresa'] });
  });
});
