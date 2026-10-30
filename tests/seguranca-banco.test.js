// =========================================================================
// Segurança por papel, testada contra um POSTGRES DE VERDADE com as migrações reais do projeto.
// Primeiro, prova que as brechas EXISTIAM (os mesmos ataques funcionam no banco ANTES da correção, sql/45);
// depois, que a correção as fecha SEM quebrar o que é legítimo (convites, cadastro, gravação por área, desativação).
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarBancoReal, ID } = require('./helpers/banco-real.js');

let antesP, depoisP;
const antes = () => (antesP ||= criarBancoReal({ com45: false })); // o banco como era (até o 44)
const depois = () => (depoisP ||= criarBancoReal({ com45: true })); // com a correção (45)

// ---------- os ataques (o mesmo código roda nos dois bancos) ----------
// cada ataque devolve true se FUNCIONOU (a brecha existe)
const ATAQUES = {
  'um colaborador vira Administrador (muda o próprio papel)': async (b) => {
    await b.como(ID.colabA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`);
    return (await b.ver(`select papel from perfis where id = '${ID.colabA}'`))[0].papel === 'owner';
  },
  'um colaborador liga o módulo pago e estende o teste da própria empresa': async (b) => {
    await b
      .como(ID.colabA)
      .q(
        `update empresas set ponto_habilitado = true, trial_ate = now() + interval '5 years' where id = '${ID.empresaA}'`
      );
    return (
      (await b.ver(`select ponto_habilitado from empresas where id = '${ID.empresaA}'`))[0].ponto_habilitado === true
    );
  },
  'um colaborador cria um convite para o papel RH': async (b) => {
    await b
      .como(ID.colabA)
      .q(`insert into convites (empresa_id, codigo, papel) values ('${ID.empresaA}', 'GOLPE-RH', 'rh')`);
    return (await b.ver(`select count(*)::int as n from convites where codigo = 'GOLPE-RH'`))[0].n === 1;
  },
  'um colaborador SOBRESCREVE o documento inteiro da empresa': async (b) => {
    await b
      .como(ID.colabA)
      .q(`update dados_sistema set payload = '{"hackeado":true}'::jsonb where empresa_id = '${ID.empresaA}'`);
    return (
      (await b.ver(`select payload ? 'hackeado' as h from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].h ===
      true
    );
  },
  'um colaborador APAGA o documento da empresa': async (b) => {
    await b.como(ID.colabA).q(`delete from dados_sistema where empresa_id = '${ID.empresaA}'`);
    return (await b.ver(`select count(*)::int as n from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].n === 0;
  },
  'uma conta DESATIVADA continua lendo os dados da empresa': async (b) => {
    const r = await b.como(ID.desativadoA).q('select empresa_id from dados_sistema');
    return r.ok && r.rows.length > 0;
  },
  'um colaborador lê a tabela antiga de colaboradores': async (b) => {
    const r = await b.como(ID.colabA).q('select * from colaboradores');
    return r.ok;
  },
};

test('PROVA DAS BRECHAS: no banco ANTES da correção, TODOS os ataques funcionam (se algum falhar aqui, o teste não está provando nada)', async () => {
  const b = await antes();
  for (const [nome, ataque] of Object.entries(ATAQUES)) {
    const funcionou = await b.dentro(() => ataque(b));
    assert.equal(funcionou, true, `esperava que a brecha existisse antes da correção: ${nome}`);
  }
});

test('DEPOIS DA CORREÇÃO (sql/45): NENHUM dos ataques funciona', async () => {
  const b = await depois();
  for (const [nome, ataque] of Object.entries(ATAQUES)) {
    const funcionou = await b.dentro(() => ataque(b));
    assert.equal(funcionou, false, `a brecha continua aberta: ${nome}`);
  }
});

// ======================= perfis =======================
const papelDe = async (b, id) => (await b.ver(`select papel from perfis where id = '${id}'`))[0].papel;
const desativadoDe = async (b, id) => (await b.ver(`select desativado from perfis where id = '${id}'`))[0].desativado;

test('perfis: cada um pode mudar o próprio NOME e tirar a própria senha provisória, mas não pôr a senha provisória de volta', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set nome = 'Novo Nome' where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal((await b.ver(`select nome from perfis where id = '${ID.colabA}'`))[0].nome, 'Novo Nome');
    await b.db.exec(`update perfis set senha_provisoria = true where id = '${ID.colabA}'`);
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set senha_provisoria = false where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set senha_provisoria = true where id = '${ID.colabA}'`)).negou,
      true
    );
  });
});

test('perfis: ninguém (nem o Administrador) muda id, empresa, e-mail ou data de criação de um perfil pela API', async () => {
  const b = await depois();
  await b.dentro(async () => {
    for (const quem of [ID.colabA, ID.rhA, ID.ownerA]) {
      for (const coluna of ["empresa_id = '" + ID.empresaB + "'", "email = 'trocado@x.com'", 'created_at = now()']) {
        const r = await b.como(quem).q(`update perfis set ${coluna} where id = '${ID.colabA}'`);
        assert.ok(!r.ok || r.afetadas === 0, `${quem} conseguiu mudar ${coluna}`);
      }
    }
    assert.equal((await b.ver(`select empresa_id from perfis where id = '${ID.colabA}'`))[0].empresa_id, ID.empresaA);
  });
});

test('papel: o Administrador promove a RH, líder ou colaborador; ninguém vira Administrador; ninguém muda o próprio papel nem o do Administrador', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set papel = 'rh' where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal(await papelDe(b, ID.colabA), 'rh');
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set papel = 'lider' where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`)).negou,
      true,
      'promover a Administrador não existe'
    );
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set papel = 'colaborador' where id = '${ID.ownerA}'`)).negou,
      true,
      'o Administrador não rebaixa a si mesmo'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'colaborador' where id = '${ID.ownerA}'`)).negou,
      true,
      'o RH não rebaixa o Administrador'
    );
    assert.equal(await papelDe(b, ID.ownerA), 'owner');
  });
});

test('papel: o RH troca entre líder e colaborador, mas NÃO promove a RH, NÃO mexe em outro RH e NÃO muda o próprio papel', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'lider' where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'colaborador' where id = '${ID.colabA}'`)).permitiu,
      true
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'rh' where id = '${ID.colabA}'`)).negou,
      true,
      'só o Administrador promove a RH'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'colaborador' where id = '${ID.rh2A}'`)).negou,
      true,
      'o RH não rebaixa outro RH'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set papel = 'owner' where id = '${ID.rhA}'`)).negou,
      true,
      'o RH não vira Administrador'
    );
    assert.equal(await papelDe(b, ID.colabA), 'colaborador');
    assert.equal(await papelDe(b, ID.rhA), 'rh');
  });
});

test('papel: líder e colaborador não mudam o papel de ninguém', async () => {
  const b = await depois();
  await b.dentro(async () => {
    for (const quem of [ID.liderA, ID.colabA]) {
      assert.ok(
        !(await b.como(quem).q(`update perfis set papel = 'rh' where id = '${ID.colabA}'`)).ok ||
          (await papelDe(b, ID.colabA)) === 'colaborador'
      );
      const r = await b.como(quem).q(`update perfis set papel = 'lider' where id = '${ID.rh2A}'`);
      assert.ok(!r.ok || r.afetadas === 0);
    }
    assert.equal(await papelDe(b, ID.rh2A), 'rh');
  });
});

test('desativar: o Administrador desativa qualquer um (menos a si e outro Administrador); o RH só líder e colaborador; ninguém desativa a si mesmo', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set desativado = true where id = '${ID.rhA}'`)).permitiu,
      true,
      'o Administrador desativa um RH'
    );
    assert.equal(await desativadoDe(b, ID.rhA), true);
    await b.db.exec(`update perfis set desativado = false where id = '${ID.rhA}'`);
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set desativado = true where id = '${ID.colabA}'`)).permitiu,
      true,
      'o RH desativa um colaborador'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set desativado = true where id = '${ID.rh2A}'`)).negou,
      true,
      'o RH não desativa outro RH'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set desativado = true where id = '${ID.ownerA}'`)).negou,
      true,
      'ninguém desativa o Administrador'
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set desativado = true where id = '${ID.rhA}'`)).negou,
      true,
      'ninguém desativa a si mesmo'
    );
    assert.equal(
      (await b.como(ID.ownerA).q(`update perfis set desativado = true where id = '${ID.ownerA}'`)).negou,
      true
    );
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set desativado = true where id = '${ID.liderA}'`)).negou,
      true,
      'colaborador não desativa ninguém'
    );
    assert.equal(await desativadoDe(b, ID.ownerA), false);
  });
});

test('escopo e estrutura do perfil: só Administrador e RH mexem; o próprio colaborador não amplia o próprio acesso', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set escopo_estendido = true where id = '${ID.colabA}'`)).negou,
      true
    );
    assert.equal(
      (await b.como(ID.liderA).q(`update perfis set escopo_estendido = true where id = '${ID.liderA}'`)).negou,
      true
    );
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set estrutura_id = 'x' where id = '${ID.colabA}'`)).negou,
      true
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update perfis set escopo_estendido = true where id = '${ID.liderA}'`)).permitiu,
      true
    );
    assert.equal(
      (
        await b
          .como(ID.ownerA)
          .q(`update perfis set estrutura_id = 'e1', estrutura_nome = 'Vendas' where id = '${ID.liderA}'`)
      ).permitiu,
      true
    );
  });
});

test('perfis: coluna que ninguém previu é NEGADA por padrão (uma coluna nova nunca nasce editável)', async () => {
  const b = await depois();
  await b.dentro(async () => {
    await b.db.exec('alter table perfis add column apelido text');
    const r = await b.como(ID.colabA).q(`update perfis set apelido = 'x' where id = '${ID.colabA}'`);
    assert.equal(r.negou, true);
    assert.match(r.erro, /coluna_protegida:apelido/);
  });
});

test('perfis: o serviço do servidor (sem usuário) continua podendo tudo; ninguém altera perfis de outra empresa', async () => {
  const b = await depois();
  await b.dentro(async () => {
    await b.db.exec(`update perfis set papel = 'rh' where id = '${ID.colabA}'`); // serviço (administrador do banco)
    assert.equal(await papelDe(b, ID.colabA), 'rh');
    const fora = await b.como(ID.ownerA).q(`update perfis set nome = 'invadido' where id = '${ID.colabB}'`);
    assert.equal(fora.negou, true, 'o Administrador de uma empresa não altera perfis de outra');
    assert.notEqual((await b.ver(`select nome from perfis where id = '${ID.colabB}'`))[0].nome, 'invadido');
  });
});

test('perfis: a pessoa vê o próprio perfil e os da própria empresa; a conta desativada vê só o próprio (para o sistema dizer "conta desativada")', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (await b.como(ID.colabA).q('select id from perfis')).rows.length,
      6,
      'os 6 perfis ativos e inativos... da empresa A (vê todos da empresa)'
    );
    const d = await b.como(ID.desativadoA).q('select id, desativado from perfis');
    assert.deepEqual(
      d.rows.map((r) => [r.id, r.desativado]),
      [[ID.desativadoA, true]]
    );
  });
});

// ======================= empresas =======================
test('empresas: só o Administrador edita o cadastro (razão social, nome fantasia, CNPJ...); RH, líder e colaborador não', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (
        await b
          .como(ID.ownerA)
          .q(`update empresas set cnpj = '33333333000133', nome_fantasia = 'Novo Nome' where id = '${ID.empresaA}'`)
      ).permitiu,
      true
    );
    assert.equal((await b.ver(`select cnpj from empresas where id = '${ID.empresaA}'`))[0].cnpj, '33333333000133');
    for (const quem of [ID.rhA, ID.liderA, ID.colabA]) {
      const r = await b.como(quem).q(`update empresas set nome_fantasia = 'Invadido' where id = '${ID.empresaA}'`);
      assert.equal(r.negou, true, `${quem} editou a empresa`);
    }
  });
});

test('empresas: plano, licença, teste grátis, suspensão e pagamento NÃO são editáveis nem pelo Administrador da empresa; o super admin edita', async () => {
  const b = await depois();
  await b.dentro(async () => {
    await b.db.exec(`update empresas set acesso_suspenso = true where id = '${ID.empresaA}'`); // empresa suspensa pelo INETRIS
    for (const set of [
      'acesso_suspenso = false',
      'ponto_habilitado = true',
      "trial_ate = now() + interval '3 years'",
      'is_pagante = true',
      'created_at = now()',
    ]) {
      const r = await b.como(ID.ownerA).q(`update empresas set ${set} where id = '${ID.empresaA}'`);
      assert.equal(r.negou, true, `o Administrador conseguiu mudar: ${set}`);
      assert.match(r.erro, /coluna_protegida/);
    }
    assert.equal(
      (await b.ver(`select acesso_suspenso from empresas where id = '${ID.empresaA}'`))[0].acesso_suspenso,
      true,
      'a suspensão continua depois das tentativas'
    );
    const s = await b
      .como(ID.superAdmin)
      .q(`update empresas set is_pagante = true, acesso_suspenso = false where id = '${ID.empresaA}'`);
    assert.equal(s.permitiu, true, 'o super admin edita');
    assert.deepEqual(
      (await b.ver(`select is_pagante, acesso_suspenso from empresas where id = '${ID.empresaA}'`)).map((x) => [
        x.is_pagante,
        x.acesso_suspenso,
      ]),
      [[true, false]]
    );
  });
});

test('empresas: o Administrador de uma empresa não edita outra', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const r = await b.como(ID.ownerA).q(`update empresas set nome_fantasia = 'Invadida' where id = '${ID.empresaB}'`);
    assert.ok(!r.ok || r.afetadas === 0);
    assert.equal(
      (await b.ver(`select nome_fantasia from empresas where id = '${ID.empresaB}'`))[0].nome_fantasia,
      'Empresa B'
    );
  });
});

// ======================= convites =======================
test('convites: Administrador e RH convidam líder e colaborador; só o Administrador convida RH; ninguém cria convite de Administrador', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const novo = (quem, papel, cod) =>
      b
        .como(quem)
        .q(
          `insert into convites (empresa_id, codigo, papel, criado_por) values ('${ID.empresaA}', '${cod}', '${papel}', '${quem}')`
        );
    assert.equal((await novo(ID.rhA, 'lider', 'C1')).permitiu, true);
    assert.equal((await novo(ID.rhA, 'colaborador', 'C2')).permitiu, true);
    assert.equal((await novo(ID.rhA, 'rh', 'C3')).negou, true, 'o RH não convida RH');
    assert.equal((await novo(ID.ownerA, 'rh', 'C4')).permitiu, true, 'o Administrador convida RH');
    assert.equal((await novo(ID.ownerA, 'owner', 'C5')).negou, true, 'não existe convite de Administrador');
    assert.equal((await novo(ID.liderA, 'colaborador', 'C6')).negou, true, 'líder não convida');
    assert.equal((await novo(ID.colabA, 'colaborador', 'C7')).negou, true, 'colaborador não convida');
    assert.equal((await b.ver(`select count(*)::int as n from convites where codigo in ('C1','C2','C4')`))[0].n, 3);
    assert.equal(
      (await b.ver(`select count(*)::int as n from convites where codigo in ('C3','C5','C6','C7')`))[0].n,
      0
    );
  });
});

test('convites: só Administrador e RH veem os códigos (líder e colaborador não veem nenhum); outra empresa nunca vê', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal((await b.como(ID.rhA).q('select codigo from convites')).rows.length, 1);
    assert.equal((await b.como(ID.ownerA).q('select codigo from convites')).rows.length, 1);
    for (const quem of [ID.liderA, ID.colabA, ID.ownerB, ID.desativadoA])
      assert.equal((await b.como(quem).q('select codigo from convites')).rows.length, 0, quem);
  });
});

test('convites: o RH não troca o papel de um convite para RH nem apaga convite de RH; apaga o de líder e colaborador', async () => {
  const b = await depois();
  await b.dentro(async () => {
    await b.db.exec(
      `insert into convites (empresa_id, codigo, papel, criado_por) values ('${ID.empresaA}', 'CONVITE-RH', 'rh', '${ID.ownerA}')`
    );
    assert.equal(
      (await b.como(ID.rhA).q(`update convites set papel = 'rh' where codigo = 'CONVITE-ANTIGO'`)).negou,
      true
    );
    const apagaRh = await b.como(ID.rhA).q(`delete from convites where codigo = 'CONVITE-RH'`);
    assert.equal(apagaRh.afetadas, 0);
    assert.equal((await b.como(ID.rhA).q(`delete from convites where codigo = 'CONVITE-ANTIGO'`)).afetadas, 1);
    assert.equal((await b.como(ID.colabA).q(`delete from convites where codigo = 'CONVITE-RH'`)).afetadas, 0);
  });
});

test('CADASTRO POR CONVITE continua funcionando: o convite criado pelo RH vira uma conta com o papel do convite, e o convite fica usado', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal(
      (
        await b
          .como(ID.rhA)
          .q(
            `insert into convites (empresa_id, codigo, papel, criado_por) values ('${ID.empresaA}', 'NOVA-PESSOA', 'lider', '${ID.rhA}')`
          )
      ).permitiu,
      true
    );
    const novoId = 'aaaaaaaa-0000-4000-8000-0000000000c1';
    await b.db.exec(
      `insert into auth.users (id, email, raw_user_meta_data) values ('${novoId}', 'nova@a.com', '{"codigo_convite":"NOVA-PESSOA","nome":"Nova Pessoa","aceite_termos":true}'::jsonb)`
    );
    const p = (await b.ver(`select papel, empresa_id, nome from perfis where id = '${novoId}'`))[0];
    assert.deepEqual([p.papel, p.empresa_id, p.nome], ['lider', ID.empresaA, 'Nova Pessoa']);
    assert.equal((await b.ver(`select usado from convites where codigo = 'NOVA-PESSOA'`))[0].usado, true);
    await assert.rejects(
      b.db.exec(
        `insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'outra@a.com', '{"codigo_convite":"NOVA-PESSOA"}'::jsonb)`
      ),
      /inv.lido ou j. utilizado/,
      'o convite não vale duas vezes'
    );
  });
});

// ======================= documento da empresa =======================
test('documento: ninguém grava, apaga nem cria direto na tabela (nem o Administrador); a leitura continua por empresa', async () => {
  const b = await depois();
  await b.dentro(async () => {
    for (const quem of [ID.ownerA, ID.rhA, ID.liderA, ID.colabA]) {
      const up = await b
        .como(quem)
        .q(`update dados_sistema set payload = '{}'::jsonb where empresa_id = '${ID.empresaA}'`);
      assert.equal(up.negou, true, `${quem} gravou direto`);
      assert.equal((await b.como(quem).q(`delete from dados_sistema where empresa_id = '${ID.empresaA}'`)).negou, true);
      assert.equal(
        (await b.como(quem).q(`insert into dados_sistema (empresa_id, payload) values ('${ID.empresaA}', '{}'::jsonb)`))
          .negou,
        true
      );
      assert.equal(
        (await b.como(quem).q('select empresa_id from dados_sistema')).rows.length,
        1,
        'cada um lê só o documento da própria empresa'
      );
    }
    assert.equal(
      (await b.ver(`select payload ? 'rs' as tem from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].tem,
      true
    );
    assert.equal(
      (await b.como(ID.superAdmin).q('select empresa_id from dados_sistema')).rows.length,
      2,
      'o super admin continua lendo todas as empresas'
    );
  });
});

const salvar = (b, quem, areas, versao) =>
  b.como(quem).q('select salvar_dados_areas($1::jsonb, $2::bigint) as r', [JSON.stringify(areas), versao]);
const versaoAtual = async (b, emp = ID.empresaA) =>
  Number((await b.ver(`select versao from dados_sistema where empresa_id = '${emp}'`))[0].versao);

test('gravação por área: grava SÓ as áreas enviadas e deixa o resto exatamente como estava; a versão sobe', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    const r = await salvar(b, ID.ownerA, { ciclos: [{ id: 'k1', nota: 9 }] }, v);
    assert.equal(r.permitiu, true);
    assert.deepEqual(r.rows[0].r, { conflito: false, versao: v + 1, rejeitadas: [] });
    const doc = (await b.ver(`select payload from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].payload;
    assert.equal(doc.ciclos[0].nota, 9);
    assert.equal(doc.colaboradores[0].cpf, '123', 'as outras áreas não foram tocadas');
    assert.equal(doc.rs.candidatos.length, 1);
    assert.equal(await versaoAtual(b), v + 1);
  });
});

test('gravação por área: versão desatualizada é CONFLITO e não grava nada', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    const r = await salvar(b, ID.ownerA, { ciclos: [{ id: 'k1', nota: 5 }] }, v - 1 || 99);
    assert.deepEqual(r.rows[0].r.conflito, true);
    assert.equal(
      (
        await b.ver(`select payload->'ciclos'->0->>'nota' as n from dados_sistema where empresa_id = '${ID.empresaA}'`)
      )[0].n,
      null
    );
    assert.equal(await versaoAtual(b), v);
  });
});

const AREAS = [
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
const PERMITIDAS = {
  [ID.ownerA]: AREAS,
  [ID.rhA]: AREAS.filter((a) => a !== 'empresa'),
  [ID.liderA]: ['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima', 'rs'],
  [ID.colabA]: ['colaboradores', 'bancoAcoes', 'ciclos', 'feedbackContinuo', 'pesquisasClima'],
};

test('MATRIZ: para cada papel e cada uma das 12 áreas, grava exatamente o que o papel pode e recusa o resto (e registra a recusa)', async () => {
  const b = await depois();
  for (const [quem, permitidas] of Object.entries(PERMITIDAS)) {
    for (const area of AREAS) {
      await b.dentro(async () => {
        const v = await versaoAtual(b);
        const r = await salvar(b, quem, { [area]: { marcador: `por-${quem.slice(-2)}` } }, v);
        assert.equal(r.permitiu, true, `${quem}/${area}: ${r.erro}`);
        const gravou =
          (
            await b.ver(
              `select payload->'${area}' ? 'marcador' as g from dados_sistema where empresa_id = '${ID.empresaA}'`
            )
          )[0].g === true;
        assert.equal(
          gravou,
          permitidas.includes(area),
          `${quem} (${Object.keys(ID).find((k) => ID[k] === quem)}) em "${area}": ${gravou ? 'GRAVOU' : 'recusou'}`
        );
        assert.deepEqual(r.rows[0].r.rejeitadas, permitidas.includes(area) ? [] : [area]);
        const log = await b.ver(
          `select count(*)::int as n from seguranca_log where evento = 'area_rejeitada' and perfil_id = '${quem}'`
        );
        assert.equal(log[0].n, permitidas.includes(area) ? 0 : 1);
      });
    }
  }
});

test('gravação por área: se o pedido mistura áreas permitidas e proibidas, grava as permitidas, recusa as proibidas e diz quais', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    const r = await salvar(
      b,
      ID.colabA,
      { ciclos: [{ id: 'k1', nota: 3 }], empresa: { nome: 'Trocada' }, cargos: [], rs: { candidatos: [] } },
      v
    );
    assert.deepEqual(r.rows[0].r.rejeitadas.sort(), ['cargos', 'empresa', 'rs']);
    assert.equal(r.rows[0].r.conflito, false);
    const doc = (await b.ver(`select payload from dados_sistema where empresa_id = '${ID.empresaA}'`))[0].payload;
    assert.equal(doc.ciclos[0].nota, 3);
    assert.equal(doc.empresa.nome, 'Empresa A');
    assert.equal(doc.cargos.length, 1);
    assert.equal(doc.rs.candidatos.length, 1, 'os candidatos NÃO foram apagados');
  });
});

test('gravação por área: pedido só com áreas proibidas não grava nada e NÃO sobe a versão', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    const r = await salvar(b, ID.colabA, { nr1: { x: 1 } }, v);
    assert.deepEqual(r.rows[0].r, { conflito: false, versao: v, rejeitadas: ['nr1'] });
    assert.equal(await versaoAtual(b), v);
  });
});

test('gravação por área: conta desativada, visitante sem login, pedido malformado e função chamada por anônimo são recusados', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    const d = await salvar(b, ID.desativadoA, { ciclos: [] }, v);
    assert.equal(d.negou, true);
    assert.match(d.erro, /sem_acesso/);
    const anon = await b.como('', 'anon').q(`select salvar_dados_areas('{"ciclos":[]}'::jsonb, ${v}::bigint)`);
    assert.equal(anon.negou, true);
    for (const ruim of ['[]', '"texto"', '123', 'null']) {
      const r = await b.como(ID.ownerA).q(`select salvar_dados_areas('${ruim}'::jsonb, ${v}::bigint)`);
      assert.equal(r.negou, true, ruim);
    }
    assert.equal(await versaoAtual(b), v);
  });
});

test('empresa nova (sem documento): Administrador e RH criam; líder e colaborador não; duas criações ao mesmo tempo viram conflito', async () => {
  const b = await depois();
  await b.dentro(async () => {
    await b.db.exec(`delete from dados_sistema where empresa_id = '${ID.empresaA}'`);
    assert.equal((await salvar(b, ID.colabA, { ciclos: [] }, 0)).negou, true);
    assert.equal((await salvar(b, ID.liderA, { ciclos: [] }, 0)).negou, true);
    const r = await salvar(b, ID.ownerA, { empresa: { nome: 'Nova' }, cargos: [] }, 0);
    assert.deepEqual(r.rows[0].r, { conflito: false, versao: 1, rejeitadas: [] });
    assert.deepEqual(
      (await salvar(b, ID.rhA, { cargos: [] }, 0)).rows[0].r.conflito,
      true,
      'o documento já existe: é conflito'
    );
  });
});

test('o gatilho de versão continua sobe a versão em QUALQUER atualização do documento (inclusive do servidor)', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const v = await versaoAtual(b);
    await b.db.exec(`update dados_sistema set atualizado_em = now() where empresa_id = '${ID.empresaA}'`);
    assert.equal(await versaoAtual(b), v + 1);
  });
});

// ======================= conta desativada e tabelas antigas =======================
test('conta DESATIVADA: sem empresa, sem papel, sem dados; mas enxerga o próprio perfil', async () => {
  const b = await depois();
  await b.dentro(async () => {
    const f = await b.como(ID.desativadoA).q('select empresa_do_usuario() as e, meu_papel() as p');
    assert.deepEqual([f.rows[0].e, f.rows[0].p], [null, null]);
    assert.equal((await b.como(ID.desativadoA).q('select 1 from dados_sistema')).rows.length, 0);
    assert.equal((await b.como(ID.desativadoA).q('select 1 from convites')).rows.length, 0);
    const ativo = await b.como(ID.colabA).q('select empresa_do_usuario() as e, meu_papel() as p');
    assert.deepEqual([ativo.rows[0].e, ativo.rows[0].p], [ID.empresaA, 'colaborador']);
  });
});

test('reativar a conta devolve o acesso na hora (a regra é consultada a cada pedido)', async () => {
  const b = await depois();
  await b.dentro(async () => {
    assert.equal((await b.como(ID.desativadoA).q('select 1 from dados_sistema')).rows.length, 0);
    await b.db.exec(`update perfis set desativado = false where id = '${ID.desativadoA}'`);
    assert.equal((await b.como(ID.desativadoA).q('select 1 from dados_sistema')).rows.length, 1);
  });
});

test('tabelas antigas (substituídas pelo documento): sem acesso para qualquer usuário logado ou visitante', async () => {
  const b = await depois();
  await b.dentro(async () => {
    for (const tabela of ['avaliacoes', 'banco_acoes', 'cargos', 'colaboradores', 'culturas']) {
      for (const quem of [ID.ownerA, ID.colabA]) {
        const r = await b.como(quem).q(`select * from ${tabela}`);
        assert.equal(r.negou, true, `${quem} leu ${tabela}`);
        assert.equal((await b.como(quem).q(`delete from ${tabela}`)).negou, true);
      }
      assert.equal((await b.como('', 'anon').q(`select * from ${tabela}`)).negou, true);
    }
  });
});

test('o registro de recusas (seguranca_log) não é legível nem gravável pela API', async () => {
  const b = await depois();
  await b.dentro(async () => {
    for (const quem of [ID.ownerA, ID.colabA]) {
      assert.equal((await b.como(quem).q('select * from seguranca_log')).negou, true);
      assert.equal((await b.como(quem).q(`insert into seguranca_log (evento) values ('x')`)).negou, true);
    }
  });
});

test('a migração 45 pode ser aplicada duas vezes sem erro (re-executável) e continua se registrando', async () => {
  const b = await depois();
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '45-seguranca-papeis.sql'), 'utf8');
  await b.dentro(async () => {
    await b.db.exec(sql);
    await b.db.exec(sql);
    assert.equal(
      (await b.ver(`select count(*)::int as n from migrations_aplicadas where arquivo = '45-seguranca-papeis.sql'`))[0]
        .n,
      1
    );
    assert.equal(
      (await b.como(ID.colabA).q(`update perfis set papel = 'owner' where id = '${ID.colabA}'`)).negou,
      true,
      'depois de reaplicar, a proteção continua'
    );
  });
});

test('entrar em OUTRA empresa (mudar o próprio empresa_id) é impossível, antes e depois da correção (a regra de leitura de perfis também vale na gravação)', async () => {
  for (const banco of [await antes(), await depois()]) {
    await banco.dentro(async () => {
      const r = await banco
        .como(ID.colabA)
        .q(`update perfis set empresa_id = '${ID.empresaB}' where id = '${ID.colabA}'`);
      assert.equal(r.negou, true);
      assert.equal(
        (await banco.ver(`select empresa_id from perfis where id = '${ID.colabA}'`))[0].empresa_id,
        ID.empresaA
      );
    });
  }
});
