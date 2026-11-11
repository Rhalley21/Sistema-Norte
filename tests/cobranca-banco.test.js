// =========================================================================
// Cobrança, o banco (sql/46-cobranca.sql), num Postgres de verdade com as migrações reais: quem lê a assinatura, que NINGUÉM
// escreve pela API (nem o dono da empresa, para não alterar o próprio preço ou apagar a prova do aceite), e as regras que o
// próprio banco impõe aos valores e às situações.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { criarBancoReal, ID } = require('./helpers/banco-real.js');

let bancoP;
const banco = () => (bancoP ||= criarBancoReal({ com45: true, com46: true }));
const sql46 = fs.readFileSync(path.join(__dirname, '..', 'sql', '46-cobranca.sql'), 'utf8');

const nova = (empresa, extra = {}) => {
  const v = {
    plano: 'essencial',
    mens: 29700,
    impl: 59000,
    total: 88700,
    em: '2026-11-17',
    status: 'agendada',
    ...extra,
  };
  return `insert into assinaturas (empresa_id, plano, mensalidade_centavos, implantacao_centavos, primeira_cobranca_centavos, primeira_cobranca_em, status, aceite_em, aceite_versao, aceite_texto${v.cancelada ? ', cancelada_em' : ''})
    values ('${empresa}', '${v.plano}', ${v.mens}, ${v.impl}, ${v.total}, '${v.em}', '${v.status}', now(), 'v1', 'Texto exato que a pessoa viu'${v.cancelada ? ', now()' : ''})`;
};
async function comDuasAssinaturas(b, fn) {
  return b.dentro(async () => {
    await b.db.exec(
      `${nova(ID.empresaA)}; ${nova(ID.empresaB, { plano: 'gestao', mens: 59700, impl: 99000, total: 158700 })};`
    );
    await b.db.exec(
      `insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${ID.empresaA}', 'aceite', ''), ('${ID.empresaB}', 'aceite', '');`
    );
    return fn();
  });
}
const rejeita = async (b, sql, parte) => {
  await b.db.exec('savepoint s');
  try {
    await b.db.exec(sql);
    assert.fail(`o banco deveria ter recusado: ${sql.slice(0, 80)}`);
  } catch (e) {
    if (e.code === 'ERR_ASSERTION') throw e;
    assert.match(String(e.message), parte, `erro inesperado: ${e.message}`);
  } finally {
    await b.db.exec('rollback to savepoint s');
  }
};

test('a migração 46 se registra e pode rodar de novo sem erro', async () => {
  const b = await banco();
  assert.equal(
    (await b.ver("select count(*)::int as n from migrations_aplicadas where arquivo = '46-cobranca.sql'"))[0].n,
    1
  );
  await b.db.exec(sql46); // segunda vez
  assert.equal(
    (await b.ver("select count(*)::int as n from migrations_aplicadas where arquivo = '46-cobranca.sql'"))[0].n,
    1
  );
  const tabelas = await b.ver(
    "select relname, relrowsecurity from pg_class where relname in ('assinaturas', 'assinaturas_eventos') order by relname"
  );
  assert.deepEqual(
    tabelas.map((t) => [t.relname, t.relrowsecurity]),
    [
      ['assinaturas', true],
      ['assinaturas_eventos', true],
    ],
    'a segurança por linha está ligada nas duas'
  );
});

test('quem LÊ a assinatura: o Administrador da própria empresa e o Super Admin; RH, líder, colaborador, desativado, outra empresa e visitante não', async () => {
  const b = await banco();
  await comDuasAssinaturas(b, async () => {
    const empresas = async (quem, papel) =>
      (await b.como(quem, papel).q('select empresa_id from assinaturas order by empresa_id')).rows.map(
        (r) => r.empresa_id
      );
    assert.deepEqual(await empresas(ID.ownerA), [ID.empresaA]);
    assert.deepEqual(await empresas(ID.ownerB), [ID.empresaB], 'a empresa B só vê a dela');
    assert.deepEqual(await empresas(ID.superAdmin), [ID.empresaA, ID.empresaB]);
    for (const quem of [ID.rhA, ID.rh2A, ID.liderA, ID.colabA, ID.desativadoA, ID.colabB])
      assert.deepEqual(await empresas(quem), [], `${quem} não pode ver dados de cobrança`);
    const visitante = await b.como(null, 'anon').q('select * from assinaturas');
    assert.equal(visitante.ok, false, 'visitante sem login nem consulta');
  });
});

test('quem lê os EVENTOS (aceite, avisos, cancelamento): as mesmas pessoas, e só da própria empresa', async () => {
  const b = await banco();
  await comDuasAssinaturas(b, async () => {
    const ev = async (quem) =>
      (await b.como(quem).q('select empresa_id from assinaturas_eventos')).rows.map((r) => r.empresa_id);
    assert.deepEqual(await ev(ID.ownerA), [ID.empresaA]);
    assert.deepEqual(await ev(ID.ownerB), [ID.empresaB]);
    assert.equal((await ev(ID.superAdmin)).length, 2);
    for (const quem of [ID.rhA, ID.liderA, ID.colabA, ID.desativadoA]) assert.deepEqual(await ev(quem), []);
    assert.equal((await b.como(null, 'anon').q('select * from assinaturas_eventos')).ok, false);
  });
});

test('NINGUÉM escreve pela API, nem o dono da empresa nem o Super Admin: não altera o preço, não cancela, não apaga a prova do aceite', async () => {
  const b = await banco();
  await comDuasAssinaturas(b, async () => {
    for (const quem of [ID.ownerA, ID.rhA, ID.colabA, ID.superAdmin]) {
      const tentativas = [
        `update assinaturas set mensalidade_centavos = 100, primeira_cobranca_centavos = 59100 where empresa_id = '${ID.empresaA}'`,
        `update assinaturas set status = 'cancelada', cancelada_em = now() where empresa_id = '${ID.empresaA}'`,
        `update assinaturas set aceite_texto = 'outro texto' where empresa_id = '${ID.empresaA}'`,
        `delete from assinaturas where empresa_id = '${ID.empresaA}'`,
        `delete from assinaturas_eventos where empresa_id = '${ID.empresaA}'`,
        `update assinaturas_eventos set detalhes = '{"x":1}' where empresa_id = '${ID.empresaA}'`,
        `insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${ID.empresaA}', 'cobranca_aprovada', 'falso')`,
      ];
      for (const t of tentativas)
        assert.equal((await b.como(quem).q(t)).permitiu, false, `${quem} conseguiu: ${t.slice(0, 60)}`);
    }
    // a outra empresa também não cria uma assinatura para si
    await b.db.exec(`delete from assinaturas where empresa_id = '${ID.empresaB}'`);
    assert.equal((await b.como(ID.ownerB).q(nova(ID.empresaB))).permitiu, false);
    // e nada mudou
    const [a] = await b.ver(
      `select status, mensalidade_centavos, aceite_texto from assinaturas where empresa_id = '${ID.empresaA}'`
    );
    assert.deepEqual(
      [a.status, a.mensalidade_centavos, a.aceite_texto],
      ['agendada', 29700, 'Texto exato que a pessoa viu']
    );
    assert.equal(
      (await b.ver(`select count(*)::int as n from assinaturas_eventos where empresa_id = '${ID.empresaA}'`))[0].n,
      1
    );
  });
});

test('o banco recusa valores e situações impossíveis (plano, valor zero, total que não fecha, situação inventada, cancelada incoerente)', async () => {
  const b = await banco();
  await b.dentro(async () => {
    await rejeita(b, nova(ID.empresaA, { plano: 'premium' }), /assinaturas_plano_check|check/i);
    await rejeita(b, nova(ID.empresaA, { mens: 0, total: 59000 }), /check/i);
    await rejeita(b, nova(ID.empresaA, { impl: -1, total: 29699 }), /check/i);
    await rejeita(b, nova(ID.empresaA, { total: 88699 }), /assinaturas_primeira_soma/);
    await rejeita(b, nova(ID.empresaA, { status: 'paga' }), /check/i);
    await rejeita(b, nova(ID.empresaA, { status: 'aguardando_cartao' }), /check/i); // o cartão guardado não existe neste modelo
    await rejeita(b, nova(ID.empresaA, { status: 'cancelada' }), /assinaturas_cancelada_coerente/); // cancelada sem data
    await rejeita(b, nova(ID.empresaA, { status: 'ativa', cancelada: true }), /assinaturas_cancelada_coerente/); // data de cancelamento sem estar cancelada
    await b.db.exec(nova(ID.empresaA));
    await rejeita(b, nova(ID.empresaA), /duplicate|unique|primary/i); // uma assinatura por empresa
    await b.db.exec(
      nova(ID.empresaB, {
        plano: 'estrategico',
        mens: 99700,
        impl: 149000,
        total: 248700,
        status: 'cancelada',
        cancelada: true,
      })
    );
  });
});

test('os três planos cabem nas regras do banco com os valores combinados (sem fidelidade): 887, 1.587 e 2.487 reais na primeira cobrança', async () => {
  const b = await banco();
  await b.dentro(async () => {
    await b.db.exec(nova(ID.empresaA, { plano: 'essencial', mens: 29700, impl: 59000, total: 88700 }));
    await b.db.exec(nova(ID.empresaB, { plano: 'gestao', mens: 59700, impl: 99000, total: 158700 }));
    const t = await b.ver('select plano, primeira_cobranca_centavos as total from assinaturas order by total');
    assert.deepEqual(
      t.map((r) => [r.plano, r.total]),
      [
        ['essencial', 88700],
        ['gestao', 158700],
      ]
    );
  });
});

test('o mesmo evento (mesma empresa, tipo e chave) não é registrado duas vezes: é isso que impede mandar o mesmo aviso em dobro', async () => {
  const b = await banco();
  await comDuasAssinaturas(b, async () => {
    await b.db.exec(
      `insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${ID.empresaA}', 'aviso_cobranca', '2026-11-14')`
    );
    await rejeita(
      b,
      `insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${ID.empresaA}', 'aviso_cobranca', '2026-11-14')`,
      /unique|duplicate/i
    );
    await b.db.exec(
      `insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${ID.empresaA}', 'aviso_cobranca', '2026-11-16'), ('${ID.empresaB}', 'aviso_cobranca', '2026-11-14')`
    );
  });
});

test('atualizado_em acompanha qualquer alteração feita pelo servidor', async () => {
  const b = await banco();
  await b.dentro(async () => {
    await b.db.exec(nova(ID.empresaA));
    await b.db.exec(
      `update assinaturas set atualizado_em = now() - interval '2 days', criado_em = now() - interval '2 days' where empresa_id = '${ID.empresaA}'`
    );
    await b.db.exec(`update assinaturas set status = 'agendada' where empresa_id = '${ID.empresaA}'`);
    const [r] = await b.ver(
      `select extract(epoch from (now() - atualizado_em)) as seg, extract(epoch from (now() - criado_em)) as seg_criado from assinaturas where empresa_id = '${ID.empresaA}'`
    );
    assert.ok(Number(r.seg) < 60, 'atualizado_em não foi atualizado');
    assert.ok(Number(r.seg_criado) > 86400, 'criado_em não deve mudar');
  });
});

test('apagar a empresa leva junto a assinatura e os eventos, de verdade, pela cascata do banco (nada fica órfão com dados de cobrança)', async () => {
  const b = await banco();
  await b.dentro(async () => {
    const C = 'cccccccc-0000-4000-8000-000000000001';
    await b.db.exec(
      `insert into empresas (id, razao_social, nome_fantasia, cnpj) values ('${C}', 'Empresa C', 'C', '33333333000133')`
    );
    await b.db.exec(nova(C));
    await b.db.exec(`insert into assinaturas_eventos (empresa_id, tipo, chave) values ('${C}', 'aceite', '')`);
    assert.deepEqual(
      [
        (await b.ver(`select count(*)::int as n from assinaturas where empresa_id = '${C}'`))[0].n,
        (await b.ver(`select count(*)::int as n from assinaturas_eventos where empresa_id = '${C}'`))[0].n,
      ],
      [1, 1]
    );
    await b.db.exec(`delete from empresas where id = '${C}'`);
    assert.deepEqual(
      [
        (await b.ver(`select count(*)::int as n from assinaturas where empresa_id = '${C}'`))[0].n,
        (await b.ver(`select count(*)::int as n from assinaturas_eventos where empresa_id = '${C}'`))[0].n,
      ],
      [0, 0]
    );
  });
});

test('links de pagamento: SÓ o servidor lê e escreve; nenhum usuário (nem o dono, nem o Super Admin) pela API, e o banco valida o endereço', async () => {
  const b = await banco();
  await b.dentro(async () => {
    await b.db.exec(
      "insert into links_pagamento (plano, tipo, url) values ('essencial', 'primeira', 'https://pagamento.exemplo.com/essencial-887')"
    );
    for (const quem of [ID.ownerA, ID.rhA, ID.colabA, ID.superAdmin]) {
      const le = await b.como(quem).q('select * from links_pagamento');
      assert.deepEqual([le.ok, le.rows.length], [false, 0], `${quem} não pode ler os links`);
      assert.equal(
        (
          await b
            .como(quem)
            .q("insert into links_pagamento (plano, tipo, url) values ('gestao', 'primeira', 'https://x.com/a')")
        ).permitiu,
        false
      );
      assert.equal((await b.como(quem).q("update links_pagamento set url = 'https://x.com/troca'")).permitiu, false);
      assert.equal((await b.como(quem).q('delete from links_pagamento')).permitiu, false);
    }
    assert.equal((await b.como(null, 'anon').q('select * from links_pagamento')).ok, false);
    assert.equal(
      (await b.ver("select url from links_pagamento where plano = 'essencial'"))[0].url,
      'https://pagamento.exemplo.com/essencial-887',
      'nada mudou'
    );
    // regras do próprio banco: só https, sem espaço, plano e tipo válidos, um link por plano e tipo
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('gestao', 'primeira', 'http://inseguro.com/a')",
      /check/i
    );
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('gestao', 'primeira', 'https://x.com/a b')",
      /check/i
    );
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('gestao', 'primeira', 'javascript:alert(1)')",
      /check/i
    );
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('premium', 'primeira', 'https://x.com/a')",
      /check/i
    );
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('gestao', 'anual', 'https://x.com/a')",
      /check/i
    );
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('essencial', 'primeira', 'https://x.com/outro')",
      /unique|duplicate|primary/i
    );
  });
});

test('as situações do modelo por link são aceitas, e quem confirmou o pagamento (mesmo um Super Admin sem perfil de empresa) fica registrado', async () => {
  const b = await banco();
  for (const status of ['agendada', 'aguardando_pagamento', 'ativa', 'em_atraso', 'suspensa']) {
    await b.dentro(async () => {
      await b.db.exec(nova(ID.empresaA, { status }));
      assert.equal(
        (await b.ver(`select status from assinaturas where empresa_id = '${ID.empresaA}'`))[0].status,
        status
      );
    });
  }
  await b.dentro(async () => {
    await b.db.exec(nova(ID.empresaA, { status: 'cancelada', cancelada: true }));
    assert.equal(
      (await b.ver(`select status from assinaturas where empresa_id = '${ID.empresaA}'`))[0].status,
      'cancelada'
    );
  });
  await b.dentro(async () => {
    const semPerfil = (await b.ver(`select count(*)::int as n from perfis where id = '${ID.superAdmin}'`))[0].n;
    assert.equal(semPerfil, 0, 'neste teste o Super Admin não tem perfil de empresa, como pode acontecer de verdade');
    await b.db.exec(nova(ID.empresaA, { status: 'aguardando_pagamento' }));
    await b.db.exec(
      `update assinaturas set status = 'ativa', pago_em = now(), pago_confirmado_por = '${ID.superAdmin}' where empresa_id = '${ID.empresaA}'`
    );
    const [r] = await b.ver(`select status, pago_confirmado_por from assinaturas where empresa_id = '${ID.empresaA}'`);
    assert.deepEqual([r.status, r.pago_confirmado_por], ['ativa', ID.superAdmin]);
  });
});

test('a versão SEM ASPAS da migração 46 (a que se cola no Supabase) cria as mesmas tabelas com a mesma proteção', async () => {
  const sem = execFileSync('python3', ['scripts/sql-sem-aspas.py', 'sql/46-cobranca.sql'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.ok(!/["'‘’“”]/.test(sem), 'sobrou aspa na versão sem aspas');
  const b = await criarBancoReal({ com45: true, com46: false });
  await b.db.exec(sem);
  const tabelas = await b.ver(
    "select relname, relrowsecurity from pg_class where relname in ('assinaturas', 'assinaturas_eventos', 'links_pagamento') order by relname"
  );
  assert.deepEqual(
    tabelas.map((x) => [x.relname, x.relrowsecurity]),
    [
      ['assinaturas', true],
      ['assinaturas_eventos', true],
      ['links_pagamento', true],
    ]
  );
  await b.dentro(async () => {
    await b.db.exec(nova(ID.empresaA));
    assert.equal((await b.como(ID.ownerA).q('select * from assinaturas')).rows.length, 1);
    assert.equal((await b.como(ID.rhA).q('select * from assinaturas')).rows.length, 0);
    assert.equal(
      (await b.como(ID.ownerA).q(`update assinaturas set mensalidade_centavos = 1 where empresa_id = '${ID.empresaA}'`))
        .permitiu,
      false
    );
    assert.equal((await b.como(ID.ownerA).q('select * from links_pagamento')).ok, false);
    await rejeita(
      b,
      "insert into links_pagamento (plano, tipo, url) values ('gestao', 'primeira', 'https://x.com/a b')",
      /check/i
    );
    assert.equal(
      (await b.ver("select count(*)::int as n from migrations_aplicadas where arquivo = '46-cobranca.sql'"))[0].n,
      1
    );
  });
});
