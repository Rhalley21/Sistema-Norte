// =========================================================================
// Cobrança por link, a ROTINA DIÁRIA (supabase/functions/rotinas-agendadas): no fim do teste a assinatura passa a aguardar o
// pagamento e o Administrador recebe o link do plano (3 e 1 dia antes, no dia, e 2 dias depois). Nada é cobrado sozinho. Roda
// o código real da tarefa contra o banco falso e o e-mail simulado do projeto, com o relógio parado em 10/10/2026.
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
const AGORA = Date.parse('2026-10-10T11:00:00Z'); // 08:00 de Brasília, 10/10/2026
const HOJE = '2026-10-10';
const WHATS = 'https://wa.me/558999857062?text=Ol%C3%A1';

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

const ass = (empresa, plano_, status, primeira, extra = {}) => {
  const v = { essencial: [29700, 0], gestao: [59700, 0], estrategico: [99700, 0] }[plano_]; // implantação combinada por WhatsApp: fora do pagamento
  return {
    empresa_id: empresa,
    plano: plano_,
    status,
    primeira_cobranca_em: primeira,
    mensalidade_centavos: v[0],
    implantacao_centavos: v[1],
    primeira_cobranca_centavos: v[0] + v[1],
    ...extra,
  };
};
function cenario() {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  return {
    empresas: ids.map((id) => ({
      id,
      nome_fantasia: `Empresa ${id}`,
      trial_ate: null,
      is_pagante: false,
      acesso_suspenso: false,
    })),
    perfis: ids.flatMap((id) => [
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
    assinaturas: [
      ass('A', 'essencial', 'agendada', '2026-10-13'), // faltam 3
      ass('B', 'estrategico', 'agendada', '2026-10-11'), // falta 1
      ass('C', 'gestao', 'agendada', '2026-10-10'), // é hoje
      ass('D', 'essencial', 'aguardando_pagamento', '2026-10-08'), // terminou há 2 dias
      ass('E', 'essencial', 'agendada', '2026-10-14'), // faltam 4: nada
      ass('F', 'essencial', 'ativa', '2026-10-10'), // já pagou
      ass('G', 'essencial', 'cancelada', '2026-10-10', { cancelada_em: '2026-10-05T10:00:00Z' }), // cancelou
      ass('H', 'essencial', 'aguardando_pagamento', '2026-10-09'), // terminou ontem: não é dia de aviso
      ass('I', 'essencial', 'agendada', '2026-10-09'), // o dia passou sem a rotina rodar: só vira "aguardando"
      ass('J', 'essencial', 'agendada', '2026-10-20'), // longe
    ],
    links_pagamento: [
      { plano: 'essencial', tipo: 'primeira', url: 'https://pague.exemplo.com/essencial-887' },
      { plano: 'estrategico', tipo: 'primeira', url: 'https://pague.exemplo.com/estrategico-2487' },
      // o plano "gestao" NÃO tem link cadastrado
    ],
    assinaturas_eventos: [],
    rate_limit_log: [],
    __agora: new Date(AGORA).toISOString(),
  };
}

// ======================= a lógica pura =======================
test(
  'quem recebe aviso HOJE: antes do fim só "agendada", no dia e depois só "aguardando pagamento"; pago, cancelado, em atraso e suspenso nunca',
  opcoes,
  () => {
    const c = tarefas();
    const f = (status, em) => c.avisoDeCobranca(plano({ status, primeira_cobranca_em: em }), HOJE);
    const d = (n) => new Date(Date.parse(`${HOJE}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    assert.deepEqual(
      [3, 2, 1, 0, -1, -2, 4, 7].map((n) => f('agendada', d(n))),
      [3, null, 1, 0, null, null, null, null]
    );
    assert.deepEqual(
      [3, 1, 0, -1, -2, -3].map((n) => f('aguardando_pagamento', d(n))),
      [null, null, 0, null, -2, null]
    );
    for (const s of ['ativa', 'cancelada', 'em_atraso', 'suspensa'])
      for (const n of [3, 1, 0, -2]) assert.equal(f(s, d(n)), null, `${s} ${n}`);
    assert.equal(c.avisoDeCobranca(null, HOJE), null);
    assert.equal(c.avisoDeCobranca(plano({ status: 'agendada' }), HOJE), null);
    assert.equal(c.avisoDeCobranca(plano({ status: 'agendada', primeira_cobranca_em: 'lixo' }), HOJE), null);
  }
);

test('a chave do aviso e os assuntos', opcoes, () => {
  const c = tarefas();
  assert.equal(c.chaveAvisoCobranca(plano({ primeira_cobranca_em: '2026-10-13' }), 3), '2026-10-13:D3');
  assert.deepEqual(
    [3, 1, 0, -2].map((n) => c.assuntoCobranca(n)),
    [
      'Seu teste grátis do INETRIS termina em 3 dias',
      'Seu teste grátis do INETRIS termina amanhã',
      'Hoje é o último dia do seu teste grátis do INETRIS',
      'Seu acesso ao INETRIS está pausado: pague para voltar',
    ]
  );
});

const DADOS = {
  nomePessoa: 'Ana',
  nomeEmpresa: 'Loja Aurora',
  plano: 'Essencial',
  mensalidade: 'R$ 297,00',
  implantacao: 'R$ 590,00',
  total: 'R$ 887,00',
  fim: '13/10/2026',
  link: 'https://pague.exemplo.com/essencial-887',
  whatsapp: WHATS,
};
test(
  'o e-mail com link: plano, valores, data, o botão de pagar, "sem fidelidade" e "nada é cobrado automaticamente"',
  opcoes,
  () => {
    const c = tarefas();
    for (const dias of [3, 1, 0]) {
      const h = c.corpoCobranca(dias, plano(DADOS));
      for (const t of [
        'Olá, Ana!',
        '<b>Loja Aurora</b>',
        '<b>Essencial</b>',
        'R$ 297,00',
        'sem fidelidade',
        'R$ 590,00',
        'única vez',
        'R$ 887,00',
        'href="https://pague.exemplo.com/essencial-887"',
        'pagar agora',
        'Nada é cobrado automaticamente',
        'Instituto INETRIS',
      ])
        assert.ok(h.includes(t), `D${dias}: ${t}`);
    }
    assert.ok(
      c.corpoCobranca(3, plano(DADOS)).includes('daqui a 3 dias') &&
        c.corpoCobranca(3, plano(DADOS)).includes('13/10/2026')
    );
    assert.ok(c.corpoCobranca(1, plano(DADOS)).includes('(amanhã)'));
    assert.ok(c.corpoCobranca(0, plano(DADOS)).includes('último dia'));
    const pausado = c.corpoCobranca(-2, plano(DADOS));
    assert.ok(
      pausado.includes('está pausado desde 13/10/2026') &&
        pausado.includes('Seus dados continuam guardados') &&
        pausado.includes('pagar agora')
    );
  }
);

test('e-mail sem link cadastrado: troca o botão pelo WhatsApp (nunca um link vazio)', opcoes, () => {
  const c = tarefas();
  const h = c.corpoCobranca(3, plano({ ...DADOS, link: null }));
  assert.ok(!h.includes('pagar agora') && !h.includes('href=""'));
  assert.ok(h.includes('fale com a gente no WhatsApp') && h.includes('R$ 887,00') && h.includes('wa.me/558999857062'));
});

test(
  'e-mail SEM implantação no pagamento (o caso real): diz que a implantação é combinada por WhatsApp e cobra só a primeira mensalidade',
  opcoes,
  () => {
    const c = tarefas();
    for (const dias of [3, 1, 0]) {
      const h = c.corpoCobranca(dias, plano({ ...DADOS, implantacao: null, total: 'R$ 297,00' }));
      assert.ok(
        h.includes('mensalidade de R$ 297,00 (sem fidelidade)') &&
          h.includes('A implantação é combinada com a gente pelo WhatsApp'),
        `D${dias}`
      );
      assert.ok(h.includes('pague <b>R$ 297,00</b> (a primeira mensalidade) pelo cartão'), `D${dias}`);
      assert.ok(
        !h.includes('R$ 590,00') &&
          !h.includes('implantação e primeira mensalidade') &&
          !h.includes('cobrada uma única vez'),
        `D${dias}: não pode citar implantação como parte do pagamento`
      );
    }
    const pausado = c.corpoCobranca(-2, plano({ ...DADOS, implantacao: null, total: 'R$ 297,00' }));
    assert.ok(
      pausado.includes('pague <b>R$ 297,00</b> (a primeira mensalidade)') &&
        !pausado.includes('implantação e primeira mensalidade')
    );
  }
);

test(
  'a rotina manda o e-mail SEM implantação quando a assinatura tem implantação 0 (o caso real), e COM implantação quando há valor',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const dados = cenario(); // A: essencial, implantação 0
    const b = dados.assinaturas.find((x) => x.empresa_id === 'B');
    b.implantacao_centavos = 149000; // B: com implantação
    b.primeira_cobranca_centavos = 99700 + 149000;
    await c.avisosDeCobranca(criarBanco(dados), enviar, AGORA, WHATS, 'equipe@x.com');
    const a = emailPara(lista, 'donoA@x.com')[0].corpoHtml;
    assert.ok(
      a.includes('A implantação é combinada com a gente pelo WhatsApp') &&
        a.includes('(a primeira mensalidade)') &&
        !a.includes('implantação de')
    );
    const comImpl = emailPara(lista, 'donoB@x.com')[0].corpoHtml;
    assert.ok(
      comImpl.includes('implantação de R$ 1.490,00') &&
        comImpl.includes('(implantação e primeira mensalidade)') &&
        comImpl.includes('R$ 2.487,00')
    );
  }
);

test(
  'tudo que vem do banco entra escapado no e-mail (nome da pessoa, empresa e até o endereço do link)',
  opcoes,
  () => {
    const c = tarefas();
    const ruim = '<img src=x onerror=alert(1)>';
    const h = c.corpoCobranca(
      3,
      plano({ ...DADOS, nomePessoa: ruim, nomeEmpresa: ruim, link: 'https://x.com/"><script>1</script>' })
    );
    assert.ok(!h.includes('<img src=x') && !h.includes('<script>'));
    assert.ok(h.includes('&lt;img src=x') && h.includes('&quot;&gt;&lt;script&gt;'));
  }
);

test(
  'o dinheiro formatado na rotina é IGUAL ao da função cobranca (duas cópias do mesmo cálculo, uma conferindo a outra)',
  opcoes,
  () => {
    const c = tarefas();
    const fonte = ler('supabase/functions/cobranca/index.ts');
    const ini = fonte.indexOf('function formatarReais(');
    const fim = fonte.indexOf('// A data (AAAA-MM-DD) no horário de Brasília');
    const ctx = vm.createContext({ String, Math, Number });
    vm.runInContext(nodeModule.stripTypeScriptTypes(fonte.slice(ini, fim)), ctx);
    for (const v of [0, 5, 99, 100, 29700, 59000, 88700, 158700, 248700, 99999, 100000, 123456789])
      assert.equal(c.formatarReaisCobranca(v), ctx.formatarReais(v), String(v));
    assert.equal(c.formatarReaisCobranca(88700), 'R$ 887,00');
    // e os nomes dos planos são os mesmos
    assert.deepEqual(plano(vm.runInContext('NOMES_PLANO_COBRANCA', c)), {
      essencial: 'Essencial',
      gestao: 'Gestão',
      estrategico: 'Estratégico',
    });
  }
);

// ======================= a tarefa =======================
const emailPara = (lista, para) => lista.filter((e) => e.para === para);

test(
  'a rotina avisa só quem está na janela certa, com o link do PRÓPRIO plano, e só o Administrador (nunca o RH)',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const banco = criarBanco(cenario());
    const r = await c.avisosDeCobranca(banco, enviar, AGORA, WHATS, 'equipe@x.com');
    const aviso = (e) => emailPara(lista, `dono${e}@x.com`);
    // A (faltam 3), B (falta 1), C (hoje), D (terminou há 2 dias): um e-mail cada, ao Administrador
    assert.deepEqual(
      ['A', 'B', 'C', 'D'].map((e) => aviso(e).length),
      [1, 1, 1, 1]
    );
    assert.deepEqual(
      ['A', 'B', 'C', 'D'].map((e) => aviso(e)[0].assunto),
      [
        'Seu teste grátis do INETRIS termina em 3 dias',
        'Seu teste grátis do INETRIS termina amanhã',
        'Hoje é o último dia do seu teste grátis do INETRIS',
        'Seu acesso ao INETRIS está pausado: pague para voltar',
      ]
    );
    // ninguém mais: nem E (4 dias), F (já pagou), G (cancelou), H (ontem), I (dia perdido), J (longe), nem nenhum RH
    for (const e of ['E', 'F', 'G', 'H', 'I', 'J']) assert.equal(aviso(e).length, 0, `empresa ${e} não deve receber`);
    assert.equal(lista.filter((x) => x.para.startsWith('rh')).length, 0, 'o RH nunca recebe cobrança');
    // cada empresa recebe o link do seu plano e de nenhum outro
    assert.ok(
      aviso('A')[0].corpoHtml.includes('essencial-887') && !aviso('A')[0].corpoHtml.includes('estrategico-2487')
    );
    assert.ok(
      aviso('B')[0].corpoHtml.includes('estrategico-2487') && !aviso('B')[0].corpoHtml.includes('essencial-887')
    );
    assert.ok(aviso('B')[0].corpoHtml.includes('R$ 997,00'));
    assert.ok(
      aviso('A')[0].corpoHtml.includes('R$ 297,00') &&
        aviso('A')[0].corpoHtml.includes('<b>Empresa A</b>') &&
        aviso('A')[0].corpoHtml.includes('13/10/2026')
    );
    assert.equal(r.enviados, 4);
  }
);

test(
  'no dia do fim do teste a assinatura passa a aguardar o pagamento; também a que perdeu o dia; as demais ficam como estão',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    const r = await c.avisosDeCobranca(banco, emailsFalsos().enviar, AGORA, WHATS, 'equipe@x.com');
    const st = Object.fromEntries(banco.tabelas.assinaturas.map((a) => [a.empresa_id, a.status]));
    assert.deepEqual(st, {
      A: 'agendada',
      B: 'agendada',
      C: 'aguardando_pagamento',
      D: 'aguardando_pagamento',
      E: 'agendada',
      F: 'ativa',
      G: 'cancelada',
      H: 'aguardando_pagamento',
      I: 'aguardando_pagamento',
      J: 'agendada',
    });
    assert.equal(r.viraramAguardando, 2, 'C (hoje) e I (dia perdido)');
  }
);

test('rodar de novo no mesmo dia não manda nada em dobro (cada aviso fica registrado)', opcoes, async () => {
  const c = tarefas();
  const { lista, enviar } = emailsFalsos();
  const banco = criarBanco(cenario());
  await c.avisosDeCobranca(banco, enviar, AGORA, WHATS, 'equipe@x.com');
  const antes = lista.length;
  const eventos = banco.tabelas.assinaturas_eventos.length;
  const r2 = await c.avisosDeCobranca(banco, enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
  assert.deepEqual(
    [lista.length, banco.tabelas.assinaturas_eventos.length, r2.enviados, r2.jaEnviados],
    [antes, eventos, 0, 4]
  );
  assert.deepEqual(
    banco.tabelas.assinaturas_eventos.map((e) => [e.empresa_id, e.tipo, e.chave]).sort(),
    [
      ['A', 'aviso_cobranca', '2026-10-13:D3'],
      ['B', 'aviso_cobranca', '2026-10-11:D1'],
      ['C', 'aviso_cobranca', '2026-10-10:D0'],
      ['D', 'aviso_cobranca', '2026-10-08:D-2'],
    ].sort()
  );
});

test('e-mail que falhou NÃO fica registrado: na próxima rotina tenta de novo', opcoes, async () => {
  const c = tarefas();
  const falhando = emailsFalsos((para) => para === 'donoA@x.com');
  const banco = criarBanco(cenario());
  await c.avisosDeCobranca(banco, falhando.enviar, AGORA, WHATS, 'equipe@x.com');
  assert.ok(
    !banco.tabelas.assinaturas_eventos.some((e) => e.empresa_id === 'A'),
    'A não recebeu: não pode constar como avisada'
  );
  const ok = emailsFalsos();
  await c.avisosDeCobranca(banco, ok.enviar, AGORA, WHATS, 'equipe@x.com');
  assert.equal(emailPara(ok.lista, 'donoA@x.com').length, 1, 'tentou de novo');
});

test(
  'plano SEM link cadastrado: a pessoa recebe o aviso com o WhatsApp no lugar e a equipe é avisada, uma vez por dia',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const banco = criarBanco(cenario());
    await c.avisosDeCobranca(banco, enviar, AGORA, WHATS, 'equipe@x.com'); // o plano "gestao" (empresa C) está sem link
    const paraC = emailPara(lista, 'donoC@x.com')[0].corpoHtml;
    assert.ok(
      !paraC.includes('pagar agora') && paraC.includes('fale com a gente no WhatsApp') && paraC.includes('R$ 597,00')
    );
    const alerta = emailPara(lista, 'equipe@x.com');
    assert.deepEqual(
      alerta.map((e) => e.assunto),
      ['Falta o link de pagamento do plano Gestão']
    );
    await c.avisosDeCobranca(banco, enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(lista, 'equipe@x.com').length, 1, 'não repete o alerta no mesmo dia');
  }
);

test(
  'rodada repetida por e-mail que falhou: o alerta de link faltando NÃO se repete no mesmo dia (uma vez por plano)',
  opcoes,
  async () => {
    const c = tarefas();
    const banco = criarBanco(cenario());
    // 1ª rodada: o e-mail da empresa C (plano "gestao", sem link) falha, então o aviso dela NÃO fica registrado e será tentado de novo
    const primeira = emailsFalsos((para) => para === 'donoC@x.com');
    await c.avisosDeCobranca(banco, primeira.enviar, AGORA, WHATS, 'equipe@x.com');
    assert.equal(emailPara(primeira.lista, 'equipe@x.com').length, 1, 'a equipe foi avisada do link faltando');
    assert.ok(!banco.tabelas.assinaturas_eventos.some((e) => e.empresa_id === 'C'));
    // 2ª rodada no mesmo dia: agora o e-mail sai, mas o alerta para a equipe já foi dado hoje
    const segunda = emailsFalsos();
    await c.avisosDeCobranca(banco, segunda.enviar, AGORA + 3600000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(segunda.lista, 'donoC@x.com').length, 1, 'a pessoa recebeu na segunda tentativa');
    assert.equal(emailPara(segunda.lista, 'equipe@x.com').length, 0, 'sem repetir o alerta no mesmo dia');
    // no dia seguinte, se o link continua faltando para uma nova empresa do mesmo plano, avisa de novo
    const hoje = banco.tabelas.assinaturas.find((a) => a.empresa_id === 'C');
    hoje.status = 'agendada';
    hoje.primeira_cobranca_em = '2026-10-12'; // D1 no dia 11
    const terceira = emailsFalsos();
    await c.avisosDeCobranca(banco, terceira.enviar, AGORA + 86400000, WHATS, 'equipe@x.com');
    assert.equal(emailPara(terceira.lista, 'equipe@x.com').length, 1, 'outro dia, novo alerta');
  }
);

test(
  'empresa que já é cliente (marcada à mão como pagante) NÃO recebe pedido de pagamento, mesmo com a assinatura pendente',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const dados = cenario();
    dados.empresas.find((e) => e.id === 'A').is_pagante = true; // A estava com aviso de 3 dias
    const banco = criarBanco(dados);
    await c.avisosDeCobranca(banco, enviar, AGORA, WHATS, 'equipe@x.com');
    assert.equal(emailPara(lista, 'donoA@x.com').length, 0, 'já pagou: não pode receber pedido de pagamento');
    assert.equal(emailPara(lista, 'donoB@x.com').length, 1, 'quem não é cliente continua recebendo');
    assert.ok(!banco.tabelas.assinaturas_eventos.some((e) => e.empresa_id === 'A'));
  }
);

test(
  'Administrador desativado, sem e-mail ou sem nenhum Administrador: ninguém quebra; vários Administradores recebem todos',
  opcoes,
  async () => {
    const c = tarefas();
    const base = cenario();
    base.perfis = base.perfis.filter((p) => p.empresa_id !== 'B'); // B sem Administrador
    base.perfis.find((p) => p.id === 'donoD').desativado = true; // D: o único Administrador está desativado
    base.perfis.find((p) => p.id === 'donoC').email = null; // C: sem e-mail
    base.perfis.push({
      id: 'dono2A',
      empresa_id: 'A',
      nome: 'Segundo dono',
      email: 'dono2A@x.com',
      papel: 'owner',
      desativado: false,
    });
    const { lista, enviar } = emailsFalsos();
    const banco = criarBanco(base);
    const r = await c.avisosDeCobranca(banco, enviar, AGORA, WHATS, 'equipe@x.com');
    assert.deepEqual(
      ['donoA@x.com', 'dono2A@x.com'].map((e) => emailPara(lista, e).length),
      [1, 1]
    );
    for (const e of ['donoB@x.com', 'donoC@x.com', 'donoD@x.com']) assert.equal(emailPara(lista, e).length, 0, e);
    assert.equal(r.enviados, 2);
    assert.ok(
      !banco.tabelas.assinaturas_eventos.some((e) => ['B', 'C', 'D'].includes(e.empresa_id)),
      'sem ninguém avisado, não consta como avisada'
    );
  }
);

test(
  'quem tem assinatura NÃO recebe os avisos antigos de fim de teste (senão seriam dois e-mails dizendo coisas diferentes)',
  opcoes,
  async () => {
    const c = tarefas();
    const { lista, enviar } = emailsFalsos();
    const dados = cenario();
    // as empresas A e B estão com o teste acabando em 2 dias; só a A tem assinatura
    dados.empresas.find((e) => e.id === 'A').trial_ate = '2026-10-12T14:00:00Z';
    dados.empresas.find((e) => e.id === 'B').trial_ate = '2026-10-12T14:00:00Z';
    dados.assinaturas = dados.assinaturas.filter((a) => a.empresa_id === 'A');
    const banco = criarBanco(dados);
    await c.avisosDoTeste(banco, enviar, AGORA, { planos: 'https://s/planos', whatsapp: WHATS }, 'equipe@x.com');
    assert.equal(emailPara(lista, 'donoA@x.com').length, 0, 'A tem assinatura: recebe só os avisos de cobrança');
    assert.equal(
      emailPara(lista, 'donoB@x.com').length,
      1,
      'B não tem assinatura: continua recebendo o aviso de sempre'
    );
    // e mesmo cancelada, a assinatura silencia o aviso de "assine" (quem cancelou não deve ser cobrado de novo)
    dados.assinaturas[0].status = 'cancelada';
    const { lista: l2, enviar: e2 } = emailsFalsos();
    await c.avisosDoTeste(
      criarBanco(dados),
      e2,
      AGORA + 60000,
      { planos: 'https://s/planos', whatsapp: WHATS },
      'equipe@x.com'
    );
    assert.equal(emailPara(l2, 'donoA@x.com').length, 0);
  }
);

test(
  'a tarefa está registrada na rotina diária, depois do teste grátis, e o endereço padrão do site é o de produção',
  opcoes,
  () => {
    const o = ler('supabase/functions/rotinas-agendadas/index.ts');
    assert.ok(
      /tarefa\('teste_gratis'[^\n]*\n\s*await tarefa\('cobranca_avisos', \(\) => avisosDeCobranca\(admin, enviarEmail, agora, LINKS_TESTE\.whatsapp, EMAIL_EQUIPE\)\)/.test(
        o
      )
    );
    assert.ok(o.includes("'https://rhalley21.github.io/Sistema-Norte/'") && !o.includes('rhalley21.github.io/testes'));
    assert.ok(o.includes('const COBRANCA_DIAS_AVISO = [3, 1, 0, -2];'));
  }
);
