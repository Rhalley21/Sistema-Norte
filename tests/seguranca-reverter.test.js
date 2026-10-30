// O plano de emergência (sql/emergencia/reverter-45.sql) precisa FUNCIONAR: desfaz a proteção (as brechas voltam, como avisa o arquivo)
// e é re-executável. Fica FORA da pasta sql/ numerada: nunca é aplicado por engano e a matriz de segurança não o lê.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { criarBancoReal, ID } = require('./helpers/banco-real.js');

const reverter = fs.readFileSync(path.join(__dirname, '..', 'sql', 'emergencia', 'reverter-45.sql'), 'utf8');

test('REVERTER o 45: as brechas voltam (por isso é só emergência), a migração deixa de constar como aplicada, e dá para rodar de novo', async () => {
  const b = await criarBancoReal({ com45: true });
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`)).negou,
      true,
      'antes de reverter: protegido'
    );
    await b.db.exec(reverter);
    await b.db.exec(reverter);
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`)).permitiu,
      true,
      'depois de reverter: aberto de novo'
    );
    assert.equal(
      (
        await b
          .como(ID.colabA)
          .q(`insert into convites (empresa_id, codigo, papel) values ('${ID.empresaA}', 'X', 'rh')`)
      ).permitiu,
      true
    );
    assert.equal(
      (
        await b
          .como(ID.colabA)
          .q(`update dados_sistema set payload = '{"x":1}'::jsonb where empresa_id = '${ID.empresaA}'`)
      ).permitiu,
      true
    );
    assert.equal(
      (await b.ver(`select count(*)::int as n from migrations_aplicadas where arquivo = '45-seguranca-papeis.sql'`))[0]
        .n,
      0
    );
    // e o navegador novo continua funcionando mesmo assim: a função de gravação por área continua existindo
    const f = await b.como(ID.ownerA).q(`select salvar_dados_areas('{"ciclos":[]}'::jsonb, 0::bigint) as r`);
    assert.equal(f.ok, true);
  });
});

test('o arquivo de emergência não está na pasta numerada sql/ (a ordem de migrações e o verificador de pendências não o enxergam)', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'sql', 'reverter-45.sql')));
  assert.ok(
    fs
      .readdirSync(path.join(__dirname, '..', 'sql'))
      .filter((f) => f.endsWith('.sql'))
      .every((f) => /^\d+-/.test(f))
  );
});
