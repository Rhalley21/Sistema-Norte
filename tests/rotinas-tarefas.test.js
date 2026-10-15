// =========================================================================
// Comportamento das TAREFAS da rotina diária, com banco e envio de e-mail
// simulados: lembretes de avaliação, aviso de fim do teste grátis, encerramento
// das campanhas do NR1, prazo do banco de talentos e limpeza. Verifica o que mais
// importa: quem recebe, quem NÃO recebe, que nada é enviado duas vezes e que as
// fronteiras de data respeitam o horário de Brasília.
// =========================================================================
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

function tarefas() {
  const origem = ler('supabase/functions/rotinas-agendadas/index.ts');
  const ini = origem.indexOf('const BANCO_TALENTOS_MESES');
  const fim = origem.indexOf('// ---- fim: tarefas');
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
    console: { error() {}, log() {} },
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}

const { criarBanco, emailsFalsos } = require('./helpers/banco-falso.js');
const { criarArmazenamento } = require('./helpers/armazenamento-falso.js'); // banco e e-mail simulados (compartilhados)

const AGORA = Date.parse('2026-10-10T11:00:00Z'); // 08:00 de Brasília, 10/10/2026
const LINKS = { planos: 'https://site/index.html#planos', whatsapp: 'https://wa.me/5589' };
const ISO = (ms) => new Date(ms).toISOString();

// ======================= LEMBRETES DE AVALIAÇÃO =======================
function cenarioCiclos(extra = {}) {
  const payload = {
    ciclos: [
      {
        id: 'cy1',
        colaboradorId: 'c1',
        estado: 'Aberto',
        etapa: 'lider',
        tipoAvaliacao: 'assincrono',
        prazoLimite: '2026-10-12',
      },
    ],
    colaboradores: [{ id: 'c1', nome: 'Maria <b>S</b>', perfilId: 'pm', gestorPerfilId: 'pg' }],
    configuracoes: {},
    ...extra.payload,
  };
  return {
    empresas: [{ id: 'e1', acesso_suspenso: false, trial_ate: null, is_pagante: true }, ...(extra.empresas || [])],
    dados_sistema: [{ empresa_id: 'e1', payload }],
    perfis: [
      { id: 'pg', empresa_id: 'e1', email: 'gestor@x.com', desativado: false, papel: 'lider' },
      { id: 'pm', empresa_id: 'e1', email: 'maria@x.com', desativado: false, papel: 'colaborador' },
      { id: 'rh1', empresa_id: 'e1', email: 'rh1@x.com', desativado: false, papel: 'rh' },
      { id: 'rh2', empresa_id: 'e1', email: 'rh2@x.com', desativado: false, papel: 'rh' },
      { id: 'rhOff', empresa_id: 'e1', email: 'rh-desativado@x.com', desativado: true, papel: 'rh' },
      { id: 'rhOutra', empresa_id: 'e2', email: 'rh-outra@y.com', desativado: false, papel: 'rh' },
      ...(extra.perfis || []),
    ],
    rate_limit_log: [],
    __agora: ISO(AGORA),
  };
}

test('lembretes: o líder (de quem é a vez) recebe 2 dias antes do prazo, com o nome escapado', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioCiclos());
  const { lista, enviar } = emailsFalsos();
  const r = await c.lembretesDeCiclos(banco, enviar, AGORA);
  assert.deepEqual(plano(r), { enviados: 1, jaEnviados: 0 });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].para, 'gestor@x.com');
  assert.ok(lista[0].assunto.includes('vence em 2 dias'));
  assert.ok(lista[0].corpoHtml.includes('12/10/2026'));
  assert.ok(!lista[0].corpoHtml.includes('<b>S</b>'), 'nome do colaborador sem escape no e-mail');
});

test('lembretes: rodar de novo no mesmo dia NÃO duplica o e-mail (idempotência)', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioCiclos());
  const { lista, enviar } = emailsFalsos();
  await c.lembretesDeCiclos(banco, enviar, AGORA);
  const r2 = await c.lembretesDeCiclos(banco, enviar, AGORA + 3600000); // 1h depois
  assert.deepEqual(plano(r2), { enviados: 0, jaEnviados: 1 });
  assert.equal(lista.length, 1);
});

test('lembretes: se o e-mail FALHA, não marca como enviado — tenta de novo na próxima rodada', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioCiclos());
  const ruim = emailsFalsos(() => true);
  const r1 = await c.lembretesDeCiclos(banco, ruim.enviar, AGORA);
  assert.equal(r1.enviados, 0);
  assert.equal(banco.tabelas.rate_limit_log.length, 0, 'não pode registrar envio que não aconteceu');
  const bom = emailsFalsos();
  const r2 = await c.lembretesDeCiclos(banco, bom.enviar, AGORA + 3600000);
  assert.equal(r2.enviados, 1);
});

test(
  'lembretes: na etapa do RH, recebem os RH ATIVOS da empresa — nunca desativado nem RH de outra empresa',
  opcoes,
  async () => {
    const c = tarefas();
    const t = cenarioCiclos();
    t.dados_sistema[0].payload.ciclos[0].etapa = 'rh';
    const { lista, enviar } = emailsFalsos();
    await c.lembretesDeCiclos(criarBanco(t), enviar, AGORA);
    assert.deepEqual(lista.map((e) => e.para).sort(), ['rh1@x.com', 'rh2@x.com']);
  }
);

test('lembretes: na etapa do colaborador, quem recebe é o próprio colaborador', opcoes, async () => {
  const c = tarefas();
  const t = cenarioCiclos();
  t.dados_sistema[0].payload.ciclos[0].etapa = 'colaborador';
  const { lista, enviar } = emailsFalsos();
  await c.lembretesDeCiclos(criarBanco(t), enviar, AGORA);
  assert.deepEqual(
    lista.map((e) => e.para),
    ['maria@x.com']
  );
});

test(
  'lembretes: pessoa desativada, sem e-mail ou sem líder cadastrado NÃO derruba a rotina e não envia',
  opcoes,
  async () => {
    const c = tarefas();
    const t = cenarioCiclos();
    t.perfis.find((p) => p.id === 'pg').desativado = true;
    const a = emailsFalsos();
    await assert.doesNotReject(c.lembretesDeCiclos(criarBanco(t), a.enviar, AGORA));
    assert.equal(a.lista.length, 0);
    const t2 = cenarioCiclos();
    delete t2.dados_sistema[0].payload.colaboradores[0].gestorPerfilId;
    const b = emailsFalsos();
    await assert.doesNotReject(c.lembretesDeCiclos(criarBanco(t2), b.enviar, AGORA));
    assert.equal(b.lista.length, 0);
    const t3 = cenarioCiclos();
    t3.perfis.find((p) => p.id === 'pg').email = null;
    const d = emailsFalsos();
    await c.lembretesDeCiclos(criarBanco(t3), d.enviar, AGORA);
    assert.equal(d.lista.length, 0);
  }
);

test('lembretes: empresa que desligou, suspensa ou com teste vencido NÃO recebe', opcoes, async () => {
  const c = tarefas();
  const desligou = cenarioCiclos({ payload: { configuracoes: { notificacoes: { lembretesPrazo: false } } } });
  const a = emailsFalsos();
  await c.lembretesDeCiclos(criarBanco(desligou), a.enviar, AGORA);
  assert.equal(a.lista.length, 0);
  const suspensa = cenarioCiclos();
  suspensa.empresas[0].acesso_suspenso = true;
  const b = emailsFalsos();
  await c.lembretesDeCiclos(criarBanco(suspensa), b.enviar, AGORA);
  assert.equal(b.lista.length, 0);
  const vencido = cenarioCiclos();
  Object.assign(vencido.empresas[0], { is_pagante: false, trial_ate: '2026-10-01T00:00:00Z' });
  const d = emailsFalsos();
  await c.lembretesDeCiclos(criarBanco(vencido), d.enviar, AGORA);
  assert.equal(d.lista.length, 0);
});

test('lembretes: só nos dias D-5, D-2 e D-0; ciclo ao vivo ou encerrado não entra', opcoes, async () => {
  const c = tarefas();
  for (const [prazo, esperado] of [
    ['2026-10-15', 1],
    ['2026-10-12', 1],
    ['2026-10-10', 1],
    ['2026-10-14', 0],
    ['2026-10-11', 0],
    ['2026-10-09', 0],
  ]) {
    const t = cenarioCiclos();
    t.dados_sistema[0].payload.ciclos[0].prazoLimite = prazo;
    const { lista, enviar } = emailsFalsos();
    await c.lembretesDeCiclos(criarBanco(t), enviar, AGORA);
    assert.equal(lista.length, esperado, `prazo ${prazo}`);
  }
  for (const mut of [{ tipoAvaliacao: 'ao_vivo' }, { estado: 'Encerrado' }]) {
    const t = cenarioCiclos();
    Object.assign(t.dados_sistema[0].payload.ciclos[0], mut);
    const { lista, enviar } = emailsFalsos();
    await c.lembretesDeCiclos(criarBanco(t), enviar, AGORA);
    assert.equal(lista.length, 0, JSON.stringify(mut));
  }
});

test('lembretes: NUNCA escreve nos dados da empresa (só lê o bloco)', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioCiclos());
  await c.lembretesDeCiclos(banco, emailsFalsos().enviar, AGORA);
  assert.ok(
    !banco.rastro.some((r) => r.tabela === 'dados_sistema' && r.op !== 'select'),
    'a rotina escreveu em dados_sistema'
  );
});

// ======================= FIM DO TESTE GRÁTIS =======================
function cenarioTeste() {
  const e = (id, nome, trial_ate, extra = {}) => ({
    id,
    nome_fantasia: nome,
    trial_ate,
    is_pagante: false,
    acesso_suspenso: false,
    ...extra,
  });
  return {
    empresas: [
      e('A', 'Empresa A', '2026-10-12T14:00:00Z'), // fim dia 12 -> faltam 2
      e('B', 'Empresa B', '2026-10-10T20:00:00Z'), // fim hoje -> D-0
      e('C', 'Empresa C', '2026-10-09T15:00:00Z'), // terminou ontem -> D+1
      e('D', 'Empresa D', '2026-10-03T15:00:00Z'), // terminou há 7 dias
      e('E', 'Empresa E', '2026-10-13T15:00:00Z'), // faltam 3 -> nada
      e('F', 'Empresa F', '2026-10-12T14:00:00Z', { is_pagante: true }), // já é cliente
      e('G', 'Empresa G', '2026-10-12T14:00:00Z', { acesso_suspenso: true }),
      e('H', 'Empresa H', null), // não é teste
      e('I', 'Empresa I', '2026-09-20T15:00:00Z'), // terminou há 20 dias -> sem mais avisos
    ],
    perfis: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].flatMap((id) => [
      {
        id: `dono${id}`,
        empresa_id: id,
        nome: `Dono ${id}`,
        email: `dono${id}@x.com`,
        papel: 'owner',
        desativado: false,
      },
      { id: `rh${id}`, empresa_id: id, nome: `RH ${id}`, email: `rh${id}@x.com`, papel: 'rh', desativado: false },
    ]),
    rate_limit_log: [],
    __agora: ISO(AGORA),
  };
}

test('teste grátis: avisa o Administrador nos dias D-2, D-0, D+1 e D+7 — e só nesses', opcoes, async () => {
  const c = tarefas();
  const { lista, enviar } = emailsFalsos();
  const r = await c.avisosDoTeste(criarBanco(cenarioTeste()), enviar, AGORA, LINKS, 'equipe@x.com');
  const clientes = lista.filter((e) => e.para !== 'equipe@x.com');
  assert.deepEqual(clientes.map((e) => e.para).sort(), ['donoA@x.com', 'donoB@x.com', 'donoC@x.com', 'donoD@x.com']);
  const assunto = (para) => clientes.find((e) => e.para === para).assunto;
  assert.ok(assunto('donoA@x.com').includes('termina em 2 dias'));
  assert.ok(assunto('donoB@x.com').includes('último dia'));
  assert.ok(assunto('donoC@x.com').includes('terminou') && assunto('donoC@x.com').includes('dados estão guardados'));
  assert.ok(assunto('donoD@x.com').includes('continuar de onde parou'));
  assert.equal(r.enviados, 4);
});

test(
  'teste grátis: só o Administrador recebe — RH não; e cliente pagante, suspenso, sem teste ou há muito tempo não',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    await c.avisosDoTeste(criarBanco(cenarioTeste()), enviar, AGORA, LINKS, 'equipe@x.com');
    const para = lista.map((e) => e.para);
    assert.ok(!para.some((p) => p.startsWith('rh')), 'o RH não deve receber aviso de teste');
    ['donoE', 'donoF', 'donoG', 'donoH', 'donoI'].forEach((d) => assert.ok(!para.includes(`${d}@x.com`), d));
  }
);

test(
  'teste grátis: o fim às 23h30 de Brasília ainda é o ÚLTIMO DIA (não "termina amanhã" nem "terminou")',
  opcoes,
  async () => {
    const c = tarefas();
    const t = cenarioTeste();
    t.empresas = [
      { id: 'X', nome_fantasia: 'Noite', trial_ate: '2026-10-11T02:30:00Z', is_pagante: false, acesso_suspenso: false },
    ]; // 23:30 BRT do dia 10
    t.perfis = [
      { id: 'donoX', empresa_id: 'X', nome: 'Dono', email: 'donoX@x.com', papel: 'owner', desativado: false },
    ];
    const { lista, enviar } = emailsFalsos();
    await c.avisosDoTeste(criarBanco(t), enviar, AGORA, LINKS, 'equipe@x.com');
    assert.ok(lista[0].assunto.includes('último dia'));
  }
);

test('teste grátis: rodar de novo NÃO repete e-mail nem o resumo da equipe (idempotência)', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioTeste());
  const { lista, enviar } = emailsFalsos();
  await c.avisosDoTeste(banco, enviar, AGORA, LINKS, 'equipe@x.com');
  const antes = lista.length;
  const r2 = await c.avisosDoTeste(banco, enviar, AGORA + 3600000, LINKS, 'equipe@x.com');
  assert.equal(lista.length, antes);
  assert.deepEqual(plano(r2), { enviados: 0, jaEnviados: 4, resumoEnviado: false });
});

test('teste grátis: a equipe recebe UM resumo com as empresas e os contatos pra ligar', opcoes, async () => {
  const c = tarefas();
  const { lista, enviar } = emailsFalsos();
  const r = await c.avisosDoTeste(criarBanco(cenarioTeste()), enviar, AGORA, LINKS, 'equipe@x.com');
  const resumos = lista.filter((e) => e.para === 'equipe@x.com');
  assert.equal(resumos.length, 1);
  assert.equal(r.resumoEnviado, true);
  assert.ok(resumos[0].assunto.includes('(4)'));
  const html = resumos[0].corpoHtml;
  [
    'Empresa A',
    'Empresa B',
    'Empresa C',
    'Empresa D',
    'donoA@x.com',
    'termina em 2 dias',
    'termina hoje',
    'terminou há 1 dia',
    'terminou há 7 dias',
  ].forEach((trecho) => assert.ok(html.includes(trecho), trecho));
  assert.ok(!html.includes('Empresa E') && !html.includes('Empresa F'));
});

test(
  'teste grátis: empresa sem Administrador com e-mail aparece no resumo da equipe (sem quebrar)',
  opcoes,
  async () => {
    const c = tarefas();
    const t = cenarioTeste();
    t.perfis = t.perfis.filter((p) => !(p.empresa_id === 'A' && p.papel === 'owner'));
    const { lista, enviar } = emailsFalsos();
    await assert.doesNotReject(c.avisosDoTeste(criarBanco(t), enviar, AGORA, LINKS, 'equipe@x.com'));
    const resumo = lista.find((e) => e.para === 'equipe@x.com');
    assert.ok(resumo.corpoHtml.includes('sem e-mail de Administrador'));
  }
);

test(
  'teste grátis: nome da empresa e da pessoa escapados, e o e-mail leva os links de plano e WhatsApp',
  opcoes,
  async () => {
    const c = tarefas();
    const t = cenarioTeste();
    t.empresas = [
      {
        id: 'X',
        nome_fantasia: 'Loja <script>x</script>',
        trial_ate: '2026-10-12T14:00:00Z',
        is_pagante: false,
        acesso_suspenso: false,
      },
    ];
    t.perfis = [
      { id: 'dX', empresa_id: 'X', nome: 'Ana <img src=x>', email: 'ana@x.com', papel: 'owner', desativado: false },
    ];
    const { lista, enviar } = emailsFalsos();
    await c.avisosDoTeste(criarBanco(t), enviar, AGORA, LINKS, 'equipe@x.com');
    const html = lista.find((e) => e.para === 'ana@x.com').corpoHtml;
    assert.ok(!html.includes('<script>') && !html.includes('<img'));
    assert.ok(html.includes(LINKS.planos) && html.includes(LINKS.whatsapp) && html.includes('12/10/2026'));
  }
);

test('teste grátis: e-mail que falha não é marcado como enviado (tenta na próxima rodada)', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioTeste());
  await c.avisosDoTeste(banco, emailsFalsos(() => true).enviar, AGORA, LINKS, 'equipe@x.com');
  assert.equal(banco.tabelas.rate_limit_log.length, 0);
  const { lista, enviar } = emailsFalsos();
  const r = await c.avisosDoTeste(banco, enviar, AGORA + 3600000, LINKS, 'equipe@x.com');
  assert.equal(r.enviados, 4);
});

// ======================= NR1 =======================
function cenarioNr1() {
  return {
    empresas: [
      { id: 'e1', acesso_suspenso: false, trial_ate: null, is_pagante: true },
      { id: 'e2', acesso_suspenso: true, trial_ate: null, is_pagante: true },
    ],
    nr1_campanhas: [
      { id: 'c1', empresa_id: 'e1', nome: 'Clima <b>2026</b>', status: 'ativa', data_fim: '2026-10-09' }, // venceu ontem
      { id: 'c2', empresa_id: 'e1', nome: 'Termina hoje', status: 'ativa', data_fim: '2026-10-10' }, // hoje: ainda vale
      { id: 'c3', empresa_id: 'e1', nome: 'Futura', status: 'ativa', data_fim: '2026-10-20' },
      { id: 'c4', empresa_id: 'e1', nome: 'Já encerrada', status: 'encerrada', data_fim: '2026-09-01' },
      { id: 'c5', empresa_id: 'e2', nome: 'Empresa suspensa', status: 'ativa', data_fim: '2026-10-01' },
    ],
    perfis: [
      { id: 'o1', empresa_id: 'e1', email: 'dono@x.com', papel: 'owner', desativado: false },
      { id: 'r1', empresa_id: 'e1', email: 'rh@x.com', papel: 'rh', desativado: false },
      { id: 'l1', empresa_id: 'e1', email: 'lider@x.com', papel: 'lider', desativado: false },
      { id: 'rOff', empresa_id: 'e1', email: 'rh-off@x.com', papel: 'rh', desativado: true },
      { id: 'o2', empresa_id: 'e2', email: 'dono2@y.com', papel: 'owner', desativado: false },
    ],
    __agora: ISO(AGORA),
  };
}

test(
  'NR1: encerra só a campanha ATIVA e VENCIDA — a que termina hoje, a futura e a já encerrada ficam como estão',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenarioNr1());
    await c.encerrarCampanhasNr1(banco, emailsFalsos().enviar, AGORA);
    const st = Object.fromEntries(banco.tabelas.nr1_campanhas.map((x) => [x.id, x.status]));
    assert.deepEqual(st, { c1: 'encerrada', c2: 'ativa', c3: 'ativa', c4: 'encerrada', c5: 'encerrada' });
    const c1 = banco.tabelas.nr1_campanhas.find((x) => x.id === 'c1');
    assert.equal(c1.auto_encerrada, true);
    assert.equal(c1.encerrada_em, ISO(AGORA));
    assert.equal(
      banco.tabelas.nr1_campanhas.find((x) => x.id === 'c4').auto_encerrada,
      undefined,
      'não mexe em quem já estava encerrada'
    );
  }
);

test(
  'NR1: a data final é INCLUSIVA e vale no horário de Brasília — às 23h30 do último dia ainda não encerra',
  opcoes,
  async () => {
    const c = tarefas();
    const base = () => ({
      empresas: [{ id: 'e1', acesso_suspenso: false, is_pagante: true }],
      nr1_campanhas: [{ id: 'x', empresa_id: 'e1', nome: 'N', status: 'ativa', data_fim: '2026-10-10' }],
      perfis: [],
      __agora: '',
    });
    const noite = criarBanco(base()); // 23:30 de Brasília de 10/10 = 02:30Z de 11/10
    await c.encerrarCampanhasNr1(noite, emailsFalsos().enviar, Date.parse('2026-10-11T02:30:00Z'));
    assert.equal(noite.tabelas.nr1_campanhas[0].status, 'ativa');
    const madrugada = criarBanco(base()); // 00:30 de Brasília de 11/10 = 03:30Z
    await c.encerrarCampanhasNr1(madrugada, emailsFalsos().enviar, Date.parse('2026-10-11T03:30:00Z'));
    assert.equal(madrugada.tabelas.nr1_campanhas[0].status, 'encerrada');
  }
);

test(
  'NR1: avisa o Administrador e o RH ATIVOS da empresa certa (nunca líder, desativado ou outra empresa)',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const r = await c.encerrarCampanhasNr1(criarBanco(cenarioNr1()), enviar, AGORA);
    assert.deepEqual(lista.map((e) => e.para).sort(), ['dono@x.com', 'rh@x.com']);
    assert.ok(!lista.some((e) => ['lider@x.com', 'rh-off@x.com', 'dono2@y.com'].includes(e.para)));
    assert.deepEqual(plano(r), { encerradas: 2, avisos: 2 }); // c1 e c5 encerradas; só a da empresa ativa gera aviso
  }
);

test('NR1: empresa suspensa tem a campanha encerrada (dado), mas não recebe e-mail', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco(cenarioNr1());
  const { lista, enviar } = emailsFalsos();
  await c.encerrarCampanhasNr1(banco, enviar, AGORA);
  assert.equal(banco.tabelas.nr1_campanhas.find((x) => x.id === 'c5').status, 'encerrada');
  assert.ok(!lista.some((e) => e.para === 'dono2@y.com'));
});

test(
  'NR1: nome da campanha escapado no e-mail, e rodar de novo não repete (nada mais a encerrar)',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenarioNr1());
    const { lista, enviar } = emailsFalsos();
    await c.encerrarCampanhasNr1(banco, enviar, AGORA);
    assert.ok(!lista[0].corpoHtml.includes('<b>2026</b>'));
    assert.ok(lista[0].corpoHtml.includes('09/10/2026') && lista[0].assunto.includes('Campanha NR1 encerrada'));
    const r2 = await c.encerrarCampanhasNr1(banco, enviar, AGORA + 3600000);
    assert.deepEqual(plano(r2), { encerradas: 0, avisos: 0 });
    assert.equal(lista.length, 2);
  }
);

// ======================= PRAZO DO BANCO DE TALENTOS E LIMPEZA =======================
test('banco de talentos: remove só quem passou de 24 meses (a fronteira é exata)', opcoes, async () => {
  const c = tarefas();
  const banco = criarBanco({
    rs_banco_talentos: [
      { id: 'velho', criado_em: '2024-10-10T10:59:59Z' }, // 1s além de 24 meses
      { id: 'limite', criado_em: '2024-10-10T11:00:00Z' }, // exatamente 24 meses: ainda vale
      { id: 'novo', criado_em: '2026-01-01T00:00:00Z' },
    ],
  });
  const r = await c.purgarBancoTalentos(banco, AGORA);
  assert.deepEqual(plano(r), { removidos: 1 });
  assert.deepEqual(banco.tabelas.rs_banco_talentos.map((x) => x.id).sort(), ['limite', 'novo']);
});

test(
  'limpeza do log: apaga o que passou de 35 dias e PRESERVA o que os limites de 30 dias ainda precisam',
  opcoes,
  async () => {
    const c = tarefas();
    const dia = (n) => ISO(AGORA - n * 86400000);
    const banco = criarBanco({
      rate_limit_log: [
        { id: 1, criado_em: dia(40) },
        { id: 2, criado_em: dia(36) },
        { id: 3, criado_em: dia(29) },
        { id: 4, criado_em: dia(1) },
      ],
    });
    await c.limparLogs(banco, AGORA);
    assert.deepEqual(
      banco.tabelas.rate_limit_log.map((x) => x.id),
      [3, 4]
    );
  }
);

test('uma tarefa que falha no banco lança erro (a rotina isola e avisa a equipe)', opcoes, async () => {
  const c = tarefas();
  const quebrado = {
    from: () => ({
      delete: () => ({ lt: () => ({ select: async () => ({ data: null, error: { message: 'banco fora do ar' } }) }) }),
    }),
  };
  await assert.rejects(c.purgarBancoTalentos(quebrado, AGORA), /banco fora do ar/);
});

// ======================= VÍDEOS DOS CANDIDATOS =======================
const TV = 'rs_videos';
const BUCKET_V = 'videos-candidatos';
function cenarioVideos(linhas) {
  const banco = criarBanco({ [TV]: linhas, __agora: ISO(AGORA) });
  const arm = criarArmazenamento();
  return { banco, arm, admin: { from: (n) => banco.from(n), storage: arm } };
}

test('vídeos: pedido vencido sem envio vira "expirado"; enviado, cancelado e dentro do prazo não mudam', async () => {
  const c = tarefas();
  const { banco, admin } = cenarioVideos([
    {
      id: 'vencido',
      empresa_id: 'e1',
      status: 'solicitado',
      prazo_ate: ISO(AGORA - 1000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'no-prazo',
      empresa_id: 'e1',
      status: 'solicitado',
      prazo_ate: ISO(AGORA + 86400000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'feito',
      empresa_id: 'e1',
      status: 'enviado',
      prazo_ate: ISO(AGORA - 5000),
      enviado_em: ISO(AGORA - 86400000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'cancelado',
      empresa_id: 'e1',
      status: 'cancelado',
      prazo_ate: ISO(AGORA - 5000),
      criado_em: ISO(AGORA - 86400000),
    },
  ]);
  const r = await c.manterVideosRs(admin, AGORA);
  assert.deepEqual(plano(r), { expirados: 1, removidos: 0, arquivosRemovidos: 0 });
  assert.deepEqual(Object.fromEntries(banco.tabelas[TV].map((x) => [x.id, x.status])), {
    vencido: 'expirado',
    'no-prazo': 'solicitado',
    feito: 'enviado',
    cancelado: 'cancelado',
  });
});

test('vídeos: depois de 6 meses o ARQUIVO e o registro são apagados (fronteira exata); os recentes ficam intactos', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioVideos([
    {
      id: 'velho',
      empresa_id: 'e1',
      status: 'enviado',
      video_path: 'e1/velho/video.mp4',
      enviado_em: '2026-04-10T10:59:59Z',
      criado_em: '2026-04-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    }, // 1s além de 6 meses
    {
      id: 'limite',
      empresa_id: 'e1',
      status: 'enviado',
      video_path: 'e1/limite/video.mp4',
      enviado_em: '2026-04-10T12:00:00Z',
      criado_em: '2026-04-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    }, // exatamente 6 meses: ainda vale
    {
      id: 'novo',
      empresa_id: 'e1',
      status: 'enviado',
      video_path: 'e1/novo/video.webm',
      enviado_em: '2026-09-01T00:00:00Z',
      criado_em: '2026-08-30T00:00:00Z',
      prazo_ate: ISO(AGORA),
    },
  ]);
  for (const caminho of ['e1/velho/video.mp4', 'e1/limite/video.mp4', 'e1/novo/video.webm'])
    arm.simularEnvio(BUCKET_V, caminho, new Uint8Array(20), 'video/mp4');
  const r = await c.manterVideosRs(admin, AGORA);
  assert.deepEqual(plano(r), { expirados: 0, removidos: 1, arquivosRemovidos: 1 });
  assert.deepEqual(banco.tabelas[TV].map((x) => x.id).sort(), ['limite', 'novo']);
  assert.deepEqual(
    [...arm.arquivos.keys()].sort(),
    [`${BUCKET_V}/e1/limite/video.mp4`, `${BUCKET_V}/e1/novo/video.webm`].sort()
  );
});

test('vídeos: pedidos que nunca receberam vídeo também saem depois de 6 meses (contados do pedido); sobras de tentativas são apagadas junto', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioVideos([
    {
      id: 'abandonado',
      empresa_id: 'e1',
      status: 'expirado',
      video_path: null,
      criado_em: '2026-03-01T00:00:00Z',
      prazo_ate: '2026-03-08T00:00:00Z',
    },
    {
      id: 'recente',
      empresa_id: 'e1',
      status: 'expirado',
      video_path: null,
      criado_em: '2026-09-01T00:00:00Z',
      prazo_ate: '2026-09-08T00:00:00Z',
    },
  ]);
  arm.simularEnvio(BUCKET_V, 'e1/abandonado/video.webm', new Uint8Array(20), 'video/webm'); // sobra de uma tentativa que não foi confirmada
  const r = await c.manterVideosRs(admin, AGORA);
  assert.equal(r.removidos, 1);
  assert.equal(r.arquivosRemovidos, 1);
  assert.equal(arm.arquivos.size, 0);
  assert.deepEqual(
    banco.tabelas[TV].map((x) => x.id),
    ['recente']
  );
});

test('vídeos: se não conseguir apagar o arquivo, o registro FICA (a rotina tenta de novo amanhã) e a falha é avisada', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioVideos([
    {
      id: 'velho',
      empresa_id: 'e1',
      status: 'enviado',
      video_path: 'e1/velho/video.mp4',
      enviado_em: '2026-01-01T00:00:00Z',
      criado_em: '2026-01-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    },
  ]);
  arm.simularEnvio(BUCKET_V, 'e1/velho/video.mp4', new Uint8Array(20), 'video/mp4');
  const original = arm.from;
  arm.from = (b) => ({
    ...original(b),
    remove: async () => ({ data: null, error: { message: 'storage fora do ar' } }),
  });
  await assert.rejects(c.manterVideosRs(admin, AGORA), /storage fora do ar/);
  assert.equal(banco.tabelas[TV].length, 1, 'sem o arquivo apagado, o registro não pode sumir');
});

test('vídeos: o prazo de retenção (6 meses) é o MESMO na rotina, na função video-rs, na Política de Privacidade e na documentação', () => {
  const numero = (arq, re) => Number(re.exec(ler(arq))[1]);
  assert.equal(numero('supabase/functions/rotinas-agendadas/index.ts', /const VIDEO_RETENCAO_MESES = (\d+)/), 6);
  assert.equal(numero('supabase/functions/video-rs/index.ts', /const VIDEO_RETENCAO_MESES = (\d+)/), 6);
  assert.ok(
    /vídeo[\s\S]{0,400}6\s+meses|6\s+meses[\s\S]{0,400}vídeo/i.test(ler('privacidade.html')),
    'a Política de Privacidade precisa citar o vídeo e os 6 meses'
  );
  assert.ok(ler('docs/VIDEO-RS.md').includes('6 meses'));
});

// ======================= RESULTADOS ENVIADOS PELOS CANDIDATOS =======================
const TE = 'rs_entregas';
const BUCKET_E = 'entregas-candidatos';
function cenarioEntregas(linhas) {
  const banco = criarBanco({ [TE]: linhas, __agora: ISO(AGORA) });
  const arm = criarArmazenamento();
  return { banco, arm, admin: { from: (n) => banco.from(n), storage: arm } };
}

test('resultados: pedido vencido sem envio vira "expirado"; enviado, cancelado e dentro do prazo não mudam', async () => {
  const c = tarefas();
  const { banco, admin } = cenarioEntregas([
    {
      id: 'vencido',
      empresa_id: 'e1',
      status: 'solicitado',
      prazo_ate: ISO(AGORA - 1000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'no-prazo',
      empresa_id: 'e1',
      status: 'solicitado',
      prazo_ate: ISO(AGORA + 86400000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'feito',
      empresa_id: 'e1',
      status: 'enviado',
      prazo_ate: ISO(AGORA - 5000),
      enviado_em: ISO(AGORA - 86400000),
      criado_em: ISO(AGORA - 86400000),
    },
    {
      id: 'cancelado',
      empresa_id: 'e1',
      status: 'cancelado',
      prazo_ate: ISO(AGORA - 5000),
      criado_em: ISO(AGORA - 86400000),
    },
  ]);
  const r = await c.manterEntregasRs(admin, AGORA);
  assert.deepEqual(plano(r), { expirados: 1, removidos: 0, arquivosRemovidos: 0 });
  assert.deepEqual(Object.fromEntries(banco.tabelas[TE].map((x) => [x.id, x.status])), {
    vencido: 'expirado',
    'no-prazo': 'solicitado',
    feito: 'enviado',
    cancelado: 'cancelado',
  });
});

test('resultados: depois de 6 meses os ARQUIVOS (todos) e o registro são apagados (fronteira exata); os recentes ficam intactos', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioEntregas([
    {
      id: 'velho',
      empresa_id: 'e1',
      status: 'enviado',
      enviado_em: '2026-04-10T10:59:59Z',
      criado_em: '2026-04-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    }, // 1s além de 6 meses
    {
      id: 'limite',
      empresa_id: 'e1',
      status: 'enviado',
      enviado_em: '2026-04-10T12:00:00Z',
      criado_em: '2026-04-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    }, // exatamente 6 meses: ainda vale
    {
      id: 'novo',
      empresa_id: 'e1',
      status: 'enviado',
      enviado_em: '2026-09-01T00:00:00Z',
      criado_em: '2026-08-30T00:00:00Z',
      prazo_ate: ISO(AGORA),
    },
  ]);
  for (const caminho of [
    'e1/velho/arquivo-1.pdf',
    'e1/velho/arquivo-2.png',
    'e1/limite/arquivo-1.pdf',
    'e1/novo/arquivo-1.png',
  ])
    arm.simularEnvio(BUCKET_E, caminho, new Uint8Array(20), 'application/pdf');
  const r = await c.manterEntregasRs(admin, AGORA);
  assert.deepEqual(plano(r), { expirados: 0, removidos: 1, arquivosRemovidos: 2 });
  assert.deepEqual(banco.tabelas[TE].map((x) => x.id).sort(), ['limite', 'novo']);
  assert.deepEqual(
    [...arm.arquivos.keys()].sort(),
    [`${BUCKET_E}/e1/limite/arquivo-1.pdf`, `${BUCKET_E}/e1/novo/arquivo-1.png`].sort()
  );
});

test('resultados: pedidos que nunca receberam nada também saem depois de 6 meses (contados do pedido), com as sobras de tentativas', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioEntregas([
    {
      id: 'abandonado',
      empresa_id: 'e1',
      status: 'expirado',
      criado_em: '2026-03-01T00:00:00Z',
      prazo_ate: '2026-03-08T00:00:00Z',
    },
    {
      id: 'recente',
      empresa_id: 'e1',
      status: 'expirado',
      criado_em: '2026-09-01T00:00:00Z',
      prazo_ate: '2026-09-08T00:00:00Z',
    },
  ]);
  arm.simularEnvio(BUCKET_E, 'e1/abandonado/arquivo-1.png', new Uint8Array(20), 'image/png'); // sobra de tentativa não confirmada
  const r = await c.manterEntregasRs(admin, AGORA);
  assert.equal(r.removidos, 1);
  assert.equal(r.arquivosRemovidos, 1);
  assert.equal(arm.arquivos.size, 0);
  assert.deepEqual(
    banco.tabelas[TE].map((x) => x.id),
    ['recente']
  );
});

test('resultados: se não conseguir apagar os arquivos, o registro FICA (a rotina tenta de novo amanhã) e a falha é avisada', async () => {
  const c = tarefas();
  const { banco, arm, admin } = cenarioEntregas([
    {
      id: 'velho',
      empresa_id: 'e1',
      status: 'enviado',
      enviado_em: '2026-01-01T00:00:00Z',
      criado_em: '2026-01-01T00:00:00Z',
      prazo_ate: ISO(AGORA),
    },
  ]);
  arm.simularEnvio(BUCKET_E, 'e1/velho/arquivo-1.pdf', new Uint8Array(20), 'application/pdf');
  const original = arm.from;
  arm.from = (b) => ({
    ...original(b),
    remove: async () => ({ data: null, error: { message: 'storage fora do ar' } }),
  });
  await assert.rejects(c.manterEntregasRs(admin, AGORA), /storage fora do ar/);
  assert.equal(banco.tabelas[TE].length, 1, 'sem os arquivos apagados, o registro não pode sumir');
});

test('resultados: o prazo de retenção (6 meses) é o MESMO na rotina, na função entrega-rs, na Política de Privacidade e na documentação', () => {
  const numero = (arq, re) => Number(re.exec(ler(arq))[1]);
  assert.equal(numero('supabase/functions/rotinas-agendadas/index.ts', /const ENTREGA_RETENCAO_MESES = (\d+)/), 6);
  assert.equal(numero('supabase/functions/entrega-rs/index.ts', /const ENTREGA_RETENCAO_MESES = (\d+)/), 6);
  assert.ok(
    /resultad[\s\S]{0,400}6\s+meses|6\s+meses[\s\S]{0,400}resultad/i.test(ler('privacidade.html')),
    'a Política de Privacidade precisa citar os resultados e os 6 meses'
  );
  assert.ok(ler('docs/ENTREGA-RS.md').includes('6 meses'));
});
