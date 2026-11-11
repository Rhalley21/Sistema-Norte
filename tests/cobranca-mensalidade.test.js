// =========================================================================
// Cobrança por link, o CICLO MENSAL (depois do primeiro pagamento), na rotina diária: avisa o Administrador antes do vencimento, no
// dia e depois; passa a assinatura sozinha para aguardando pagamento, em atraso e suspensa (7 dias de atraso); e encerra o acesso de
// quem cancelou depois de pagar quando o período pago termina. A confirmação de cada pagamento continua com o Super Admin.
// Roda o código real da rotina contra o banco falso e o e-mail simulado do projeto, com o relógio em 10/10/2026.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { criarBanco, emailsFalsos } = require('./helpers/banco-falso.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));
const AGORA = Date.parse('2026-10-10T11:00:00Z'); // 08:00 em Brasília
const HOJE = '2026-10-10';
const WHATS = 'https://wa.me/558999857062?text=Ol%C3%A1';
const emailPara = (lista, para) => lista.filter((e) => e.para === para);

function tarefas() {
  const origem = ler('supabase/functions/rotinas-agendadas/index.ts');
  const ini = origem.indexOf('const BANCO_TALENTOS_MESES');
  const fim = origem.indexOf('// ---- fim: tarefas');
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

const PAGA = (empresa, plano_, status, proxima, extra = {}) => {
  const m = { essencial: 29700, gestao: 59700, estrategico: 99700 }[plano_];
  return {
    empresa_id: empresa,
    plano: plano_,
    status,
    mensalidade_centavos: m,
    implantacao_centavos: 0,
    primeira_cobranca_centavos: m,
    primeira_cobranca_em: '2026-08-10',
    ultima_cobranca_em: '2026-09-10',
    pago_em: '2026-09-10T12:00:00Z',
    proxima_cobranca_em: proxima,
    ...extra,
  };
};
function cenario() {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
  return {
    empresas: ids.map((id) => ({ id, nome_fantasia: `Empresa ${id}`, is_pagante: true, acesso_suspenso: false })),
    perfis: ids.flatMap((id) => [
      {
        id: `dono${id}`,
        empresa_id: id,
        nome: `Dono ${id}`,
        email: id === 'K' ? null : `dono${id}@x.com`,
        papel: 'owner',
        desativado: false,
      },
      { id: `rh${id}`, empresa_id: id, nome: `RH ${id}`, email: `rh${id}@x.com`, papel: 'rh', desativado: false },
    ]),
    assinaturas: [
      PAGA('A', 'essencial', 'ativa', '2026-10-13'), // vence em 3 dias
      PAGA('B', 'gestao', 'ativa', '2026-10-10'), // vence hoje
      PAGA('C', 'essencial', 'aguardando_pagamento', '2026-10-07'), // venceu há 3 dias
      PAGA('D', 'essencial', 'em_atraso', '2026-10-03'), // venceu há 7 dias
      PAGA('E', 'essencial', 'ativa', '2026-11-10'), // longe
      PAGA('F', 'essencial', 'ativa', '2026-10-12'), // vence em 2 dias: não é dia de aviso
      PAGA('G', 'essencial', 'em_atraso', '2026-09-20'), // a rotina não rodou: 20 dias de atraso
      PAGA('H', 'essencial', 'cancelada', '2026-10-10', { cancelada_em: '2026-10-01T10:00:00Z' }),
      PAGA('I', 'essencial', 'suspensa', '2026-09-01'),
      PAGA('J', 'essencial', 'ativa', '2026-10-13', { ultima_cobranca_em: null, pago_em: null }), // ainda no primeiro pagamento
      PAGA('K', 'essencial', 'ativa', '2026-10-13'), // Administrador sem e-mail
      PAGA('L', 'essencial', 'cancelada', '2026-10-09', { cancelada_em: '2026-09-25T10:00:00Z' }), // cancelou depois de pagar; o período acabou
      PAGA('M', 'essencial', 'cancelada', '2026-10-25', { cancelada_em: '2026-09-25T10:00:00Z' }), // cancelou depois de pagar; ainda vale
      PAGA('N', 'essencial', 'cancelada', '2026-10-09', {
        cancelada_em: '2026-09-25T10:00:00Z',
        ultima_cobranca_em: null,
        pago_em: null,
      }), // cancelou antes de pagar
    ],
    links_pagamento: [
      { plano: 'essencial', tipo: 'primeira', url: 'https://pague.exemplo.com/essencial-primeira' },
      { plano: 'essencial', tipo: 'mensalidade', url: 'https://pague.exemplo.com/essencial-mensal' },
      // o plano "gestao" NÃO tem link de mensalidade
      { plano: 'gestao', tipo: 'primeira', url: 'https://pague.exemplo.com/gestao-primeira' },
    ],
    assinaturas_eventos: [],
    rate_limit_log: [],
    __agora: new Date(AGORA).toISOString(), // o relógio do banco falso (carimba criado_em nas inclusões)
  };
}
const status = (banco) => Object.fromEntries(banco.tabelas.assinaturas.map((a) => [a.empresa_id, a.status]));

// ======================= a lógica pura =======================
test(
  'a situação devida pelos dias até o vencimento: ativa antes, aguardando no dia, em atraso de 1 a 6 dias, suspensa a partir de 7',
  opcoes,
  () => {
    const c = tarefas();
    const f = (n) => c.estadoDaMensalidade(n);
    assert.deepEqual([30, 3, 1].map(f), ['ativa', 'ativa', 'ativa']);
    assert.equal(f(0), 'aguardando_pagamento');
    assert.deepEqual([-1, -3, -6].map(f), ['em_atraso', 'em_atraso', 'em_atraso']);
    assert.deepEqual([-7, -8, -60].map(f), ['suspensa', 'suspensa', 'suspensa']);
  }
);

test('a situação só AVANÇA: nunca volta nem mexe em quem está fora do ciclo (cancelada, agendada)', opcoes, () => {
  const c = tarefas();
  const av = (de, para) => c.mensalidadeAvanca(de, para);
  assert.equal(av('ativa', 'aguardando_pagamento'), true);
  assert.equal(av('ativa', 'suspensa'), true);
  assert.equal(av('em_atraso', 'suspensa'), true);
  assert.equal(av('aguardando_pagamento', 'ativa'), false, 'não volta');
  assert.equal(av('suspensa', 'em_atraso'), false);
  assert.equal(av('em_atraso', 'em_atraso'), false);
  for (const fora of ['cancelada', 'agendada', 'qualquer']) assert.equal(av(fora, 'suspensa'), false, fora);
});

test(
  'o aviso de hoje: cada aviso só combina com a sua situação; 3 dias antes e o dia são exatos, atraso e suspensão valem por uma janela de reenvio',
  opcoes,
  () => {
    const c = tarefas();
    const f = (s, n) => c.avisoDeMensalidade(s, n);
    assert.deepEqual(
      [f('ativa', 3), f('aguardando_pagamento', 0), f('em_atraso', -3), f('suspensa', -7)],
      [3, 0, -3, -7]
    );
    assert.deepEqual(
      [
        f('aguardando_pagamento', 3),
        f('ativa', 0),
        f('ativa', -3),
        f('em_atraso', -7),
        f('suspensa', -3),
        f('cancelada', 3),
      ],
      [null, null, null, null, null, null]
    );
    for (const n of [30, 4, 2, 1]) assert.equal(f('ativa', n), null, `ativa ${n}`);
    assert.equal(f('aguardando_pagamento', -1), null);
    assert.deepEqual(
      [-1, -2, -3, -4, -6, -7].map((n) => f('em_atraso', n)),
      [null, null, -3, -3, -3, null]
    );
    assert.deepEqual(
      [-6, -7, -10, -14, -15, -40].map((n) => f('suspensa', n)),
      [null, -7, -7, -7, null, null]
    );
    assert.equal(c.chaveAvisoMensalidade('2026-10-13', 3), '2026-10-13:M3');
    assert.deepEqual(
      [3, 0, -3, -7].map((n) => c.assuntoMensalidade(n)),
      [
        'Sua mensalidade do INETRIS vence em 3 dias',
        'Sua mensalidade do INETRIS vence hoje',
        'Mensalidade do INETRIS em atraso: pague para evitar a suspensão',
        'Seu acesso ao INETRIS foi suspenso: pague para voltar',
      ]
    );
  }
);
const DADOS = {
  nomePessoa: 'Ana',
  nomeEmpresa: 'Loja Aurora',
  plano: 'Essencial',
  mensalidade: 'R$ 297,00',
  vencimento: '13/10/2026',
  suspensao: '20/10/2026',
  link: 'https://pague.exemplo.com/essencial-mensal',
  whatsapp: WHATS,
};
test(
  'os e-mails da mensalidade: vencimento, valor, o link de pagar, e a data da suspensão no aviso de atraso',
  opcoes,
  () => {
    const c = tarefas();
    const h = (n, extra = {}) => c.corpoMensalidade(n, plano({ ...DADOS, ...extra }));
    for (const n of [3, 0, -3])
      for (const t of [
        'Olá, Ana!',
        '<b>Loja Aurora</b>',
        'R$ 297,00',
        'href="https://pague.exemplo.com/essencial-mensal"',
        'pagar agora',
        'Se você já pagou, desconsidere este aviso',
        'Instituto INETRIS',
      ])
        assert.ok(h(n).includes(t), `${n}: ${t}`);
    assert.ok(h(3).includes('vence em <b>13/10/2026</b> (daqui a 3 dias)') && h(3).includes('<b>Essencial</b>'));
    assert.ok(h(0).includes('<b>vence hoje</b>'));
    assert.ok(h(-3).includes('vencida em 13/10/2026') && h(-3).includes('suspensão do acesso (em <b>20/10/2026</b>)'));
    const suspenso = h(-7);
    assert.ok(
      suspenso.includes('foi suspenso por falta de pagamento') &&
        suspenso.includes('Seus dados continuam guardados') &&
        suspenso.includes('pagar agora')
    );
    assert.ok(!/cobrado automaticamente|débito automático/i.test(h(3)), 'não promete cobrança automática');
  }
);

test('sem link cadastrado: troca o botão pelo WhatsApp; tudo que vem do banco entra escapado', opcoes, () => {
  const c = tarefas();
  const sem = c.corpoMensalidade(3, plano({ ...DADOS, link: null }));
  assert.ok(
    !sem.includes('pagar agora') &&
      !sem.includes('href=""') &&
      sem.includes('fale com a gente no WhatsApp') &&
      sem.includes('R$ 297,00')
  );
  const ruim = '<img src=x onerror=alert(1)>';
  const h = c.corpoMensalidade(
    3,
    plano({ ...DADOS, nomePessoa: ruim, nomeEmpresa: ruim, link: 'https://x.com/"><script>1</script>' })
  );
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>') && h.includes('&lt;img src=x'));
});

// ======================= a tarefa =======================
test(
  'a rotina avisa quem está nos dias certos, com o link de MENSALIDADE do plano e só ao Administrador (nunca ao RH)',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const banco = criarBanco(cenario());
    const r = await c.avisosDeMensalidade(banco, enviar, AGORA, WHATS, 'equipe@x.com');
    const aviso = (e) => emailPara(lista, `dono${e}@x.com`);
    assert.deepEqual(
      ['A', 'B', 'C', 'D'].map((e) => aviso(e).length),
      [1, 1, 1, 1]
    );
    assert.deepEqual(
      ['A', 'B', 'C', 'D'].map((e) => aviso(e)[0].assunto),
      [
        'Sua mensalidade do INETRIS vence em 3 dias',
        'Sua mensalidade do INETRIS vence hoje',
        'Mensalidade do INETRIS em atraso: pague para evitar a suspensão',
        'Seu acesso ao INETRIS foi suspenso: pague para voltar',
      ]
    );
    for (const e of ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'])
      assert.equal(aviso(e).length, 0, `empresa ${e} não deve receber`);
    assert.equal(lista.filter((x) => x.para.startsWith('rh')).length, 0, 'o RH nunca recebe cobrança');
    for (const e of ['A', 'C', 'D'])
      assert.ok(
        aviso(e)[0].corpoHtml.includes('essencial-mensal') && !aviso(e)[0].corpoHtml.includes('essencial-primeira'),
        `${e}: usa o link de mensalidade, não o do primeiro pagamento`
      );
    assert.ok(
      aviso('C')[0].corpoHtml.includes('vencida em 07/10/2026') &&
        aviso('C')[0].corpoHtml.includes('<b>14/10/2026</b>'),
      'a data da suspensão é 7 dias depois do vencimento'
    );
    assert.equal(r.enviados, 4);
  }
);

test(
  'as situações andam sozinhas: no dia aguardando, de 1 a 6 dias em atraso e com 7 dias suspensa (inclusive quando a rotina ficou dias sem rodar)',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    const r = await c.avisosDeMensalidade(banco, emailsFalsos().enviar, AGORA, WHATS, 'equipe@x.com');
    assert.deepEqual(status(banco), {
      A: 'ativa',
      B: 'aguardando_pagamento',
      C: 'em_atraso',
      D: 'suspensa',
      E: 'ativa',
      F: 'ativa',
      G: 'suspensa',
      H: 'cancelada',
      I: 'suspensa',
      J: 'ativa',
      K: 'ativa',
      L: 'cancelada',
      M: 'cancelada',
      N: 'cancelada',
    });
    assert.deepEqual([r.mudaramDeSituacao, r.suspensas], [4, 2], 'B, C, D e G mudaram; D e G foram suspensas');
  }
);

test(
  'a suspensão pausa o acesso da empresa (e SÓ das empresas que chegaram a 7 dias de atraso), registra o motivo e não repete',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    await c.avisosDeMensalidade(banco, emailsFalsos().enviar, AGORA, WHATS, 'equipe@x.com');
    const susp = Object.fromEntries(banco.tabelas.empresas.map((e) => [e.id, e.acesso_suspenso]));
    assert.deepEqual(
      Object.keys(susp).filter((k) => susp[k]),
      ['D', 'G'],
      'só D (7 dias) e G (20 dias) ficam suspensas'
    );
    assert.deepEqual(
      banco.tabelas.assinaturas_eventos
        .filter((e) => e.tipo === 'suspensa_por_falta_de_pagamento')
        .map((e) => [e.empresa_id, e.chave])
        .sort(),
      [
        ['D', '2026-10-03'],
        ['G', '2026-09-20'],
      ]
    );
    assert.ok(
      banco.tabelas.empresas.every((e) => e.is_pagante),
      'continuam clientes (os dados e o contrato ficam)'
    );
  }
);

test('rodar de novo no mesmo dia não manda nem suspende nada em dobro', opcoes, async () => {
  const c = tarefas();
  const { lista, enviar } = emailsFalsos();
  const banco = criarBanco(cenario());
  await c.avisosDeMensalidade(banco, enviar, AGORA, WHATS, 'equipe@x.com');
  const antes = lista.length;
  const eventos = banco.tabelas.assinaturas_eventos.length;
  const r2 = await c.avisosDeMensalidade(banco, enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
  assert.deepEqual(
    [lista.length, banco.tabelas.assinaturas_eventos.length, r2.enviados, r2.mudaramDeSituacao, r2.suspensas],
    [antes, eventos, 0, 0, 0]
  );
  assert.equal(r2.jaEnviados, 4);
  assert.deepEqual(
    banco.tabelas.assinaturas_eventos
      .filter((e) => e.tipo === 'aviso_mensalidade')
      .map((e) => [e.empresa_id, e.chave])
      .sort(),
    [
      ['A', '2026-10-13:M3'],
      ['B', '2026-10-10:M0'],
      ['C', '2026-10-07:M-3'],
      ['D', '2026-10-03:M-7'],
    ]
  );
});

test(
  'e-mail que falhou NÃO fica registrado: na próxima rotina tenta de novo; a situação já mudou e não muda de novo',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    await c.avisosDeMensalidade(
      banco,
      emailsFalsos((para) => para === 'donoB@x.com').enviar,
      AGORA,
      WHATS,
      'equipe@x.com'
    );
    assert.ok(!banco.tabelas.assinaturas_eventos.some((e) => e.empresa_id === 'B' && e.tipo === 'aviso_mensalidade'));
    assert.equal(status(banco).B, 'aguardando_pagamento');
    const ok = emailsFalsos();
    const r = await c.avisosDeMensalidade(banco, ok.enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(ok.lista, 'donoB@x.com').length, 1, 'tentou de novo');
    assert.equal(r.mudaramDeSituacao, 0);
  }
);

test(
  'o aviso de SUSPENSÃO que falhou no dia é reenviado nos dias seguintes (por até 14 dias), uma só vez, sem suspender de novo',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    await c.avisosDeMensalidade(banco, emailsFalsos((p) => p === 'donoD@x.com').enviar, AGORA, WHATS, 'equipe@x.com');
    assert.equal(status(banco).D, 'suspensa');
    assert.ok(
      !banco.tabelas.assinaturas_eventos.some((e) => e.empresa_id === 'D' && e.tipo === 'aviso_mensalidade'),
      'o e-mail falhou: não consta como avisada'
    );
    const { lista, enviar } = emailsFalsos();
    const r = await c.avisosDeMensalidade(banco, enviar, AGORA + 86400000, WHATS, 'equipe@x.com'); // no dia seguinte
    assert.equal(emailPara(lista, 'donoD@x.com').length, 1, 'reenviou');
    assert.equal(emailPara(lista, 'donoD@x.com')[0].assunto, 'Seu acesso ao INETRIS foi suspenso: pague para voltar');
    assert.equal(r.suspensas, 0, 'não suspende de novo');
    const { lista: l3, enviar: e3 } = emailsFalsos();
    await c.avisosDeMensalidade(banco, e3, AGORA + 2 * 86400000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(l3, 'donoD@x.com').length, 0, 'já foi avisada: não repete');
    const banco2 = criarBanco(cenario());
    const { lista: l4, enviar: e4 } = emailsFalsos();
    await c.avisosDeMensalidade(banco2, e4, AGORA + 12 * 86400000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(l4, 'donoD@x.com').length, 0, 'D com 19 dias de atraso: tarde demais para o aviso');
  }
);

test('depois que o pagamento é confirmado (vencimento um mês à frente), os avisos param', opcoes, async () => {
  const c = tarefas();
  const dados = cenario();
  const banco = criarBanco(dados);
  await c.avisosDeMensalidade(banco, emailsFalsos().enviar, AGORA, WHATS, 'equipe@x.com');
  // o Super Admin confirma o pagamento da empresa C (estava em atraso): volta a ativa com o próximo vencimento um mês à frente
  const c1 = banco.tabelas.assinaturas.find((a) => a.empresa_id === 'C');
  Object.assign(c1, { status: 'ativa', ultima_cobranca_em: HOJE, proxima_cobranca_em: '2026-11-07' });
  const { lista, enviar } = emailsFalsos();
  await c.avisosDeMensalidade(banco, enviar, AGORA + 86400000, WHATS, 'equipe@x.com');
  assert.equal(emailPara(lista, 'donoC@x.com').length, 0);
  assert.equal(status(banco).C, 'ativa');
});

test(
  'plano SEM link de mensalidade: a pessoa recebe o aviso com o WhatsApp e a equipe é avisada, uma vez por dia',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const banco = criarBanco(cenario()); // "gestao" (empresa B) está sem link de mensalidade
    await c.avisosDeMensalidade(banco, enviar, AGORA, WHATS, 'equipe@x.com');
    const paraB = emailPara(lista, 'donoB@x.com')[0].corpoHtml;
    assert.ok(
      !paraB.includes('pagar agora') && paraB.includes('fale com a gente no WhatsApp') && paraB.includes('R$ 597,00')
    );
    assert.deepEqual(
      emailPara(lista, 'equipe@x.com').map((e) => e.assunto),
      ['Falta o link de MENSALIDADE do plano Gestão']
    );
    // 1ª rodada falhou para B: na 2ª o aviso sai, mas o alerta da equipe não se repete no mesmo dia
    const banco2 = criarBanco(cenario());
    await c.avisosDeMensalidade(banco2, emailsFalsos((p) => p === 'donoB@x.com').enviar, AGORA, WHATS, 'equipe@x.com');
    const seg = emailsFalsos();
    await c.avisosDeMensalidade(banco2, seg.enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(seg.lista, 'equipe@x.com').length, 0, 'sem repetir o alerta no mesmo dia');
  }
);

test(
  'a tarefa do PRIMEIRO pagamento ignora quem já pagou uma vez (senão a mensalidade geraria dois e-mails diferentes)',
  opcoes,
  async () => {
    const c = tarefas();
    const dados = cenario();
    const b = dados.assinaturas.find((a) => a.empresa_id === 'B');
    Object.assign(b, { status: 'aguardando_pagamento', primeira_cobranca_em: HOJE }); // a data do primeiro pagamento coincide com hoje, mas já pagou antes
    dados.empresas.find((e) => e.id === 'B').is_pagante = false; // sem a outra proteção (não cobrar quem já é cliente): só o filtro do ciclo impede o e-mail
    const { lista, enviar } = emailsFalsos();
    await c.avisosDeCobranca(criarBanco(dados), enviar, AGORA, WHATS, 'equipe@x.com');
    assert.equal(emailPara(lista, 'donoB@x.com').length, 0);
    // e quem NUNCA pagou, nas mesmas condições, recebe (prova que o teste enxerga a diferença)
    const dados2 = cenario();
    const b2 = dados2.assinaturas.find((a) => a.empresa_id === 'B');
    Object.assign(b2, {
      status: 'aguardando_pagamento',
      primeira_cobranca_em: HOJE,
      ultima_cobranca_em: null,
      pago_em: null,
    });
    dados2.empresas.find((e) => e.id === 'B').is_pagante = false;
    const { lista: l2, enviar: e2 } = emailsFalsos();
    await c.avisosDeCobranca(criarBanco(dados2), e2, AGORA, WHATS, 'equipe@x.com');
    assert.equal(emailPara(l2, 'donoB@x.com').length, 1);
  }
);
test(
  'cancelou DEPOIS de pagar: mantém o acesso até o fim do período pago e então o acesso é encerrado, uma só vez; quem cancelou antes de pagar não é afetado',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    const r = await c.encerrarCanceladas(banco, AGORA);
    const emp = Object.fromEntries(banco.tabelas.empresas.map((e) => [e.id, [e.is_pagante, e.acesso_suspenso]]));
    assert.deepEqual(emp.L, [false, true], 'L: o período pago terminou');
    assert.deepEqual(emp.M, [true, false], 'M: o período pago ainda não terminou');
    assert.deepEqual(emp.N, [true, false], 'N: cancelou antes de pagar, nada a encerrar aqui');
    assert.deepEqual(emp.H, [true, false], 'H: o vencimento é hoje: o acesso vale até o fim do dia do vencimento');
    assert.equal(r.encerradas, 1, 'só L: o vencimento já passou');
    const r2 = await c.encerrarCanceladas(banco, AGORA + 3600000);
    assert.equal(r2.encerradas, 0, 'não repete');
    assert.equal(banco.tabelas.assinaturas_eventos.filter((e) => e.tipo === 'acesso_encerrado').length, 1);
  }
);

test(
  'as duas tarefas novas estão registradas na rotina diária, depois da cobrança do primeiro pagamento',
  opcoes,
  () => {
    const o = ler('supabase/functions/rotinas-agendadas/index.ts');
    assert.ok(
      /tarefa\('cobranca_avisos'[^\n]*\n\s*await tarefa\('cobranca_mensalidade', \(\) => avisosDeMensalidade\(admin, enviarEmail, agora, LINKS_TESTE\.whatsapp, EMAIL_EQUIPE\)\);\n\s*await tarefa\('cobranca_encerramentos', \(\) => encerrarCanceladas\(admin, agora\)\);/.test(
        o
      )
    );
    assert.ok(
      o.includes('const MENSALIDADE_DIAS_AVISO = [3, 0, -3, -7];') &&
        o.includes('const DIAS_ATE_SUSPENDER_MENSALIDADE = 7;')
    );
  }
);
