// =========================================================================
// Cobrança por link, o NAVEGADOR (js/59-cobranca.js): a tela do Administrador, o botão de pagar no bloqueio do 8º dia e a
// confirmação do Super Admin. O arquivo real roda numa caixa de areia, com o servidor simulado. Quem decide e grava tudo é o
// servidor; aqui se confere o que é mostrado, o que é pedido e que nada vindo de fora vira HTML ou link perigoso.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;

const PLANOS = [
  {
    chave: 'essencial',
    nome: 'Essencial',
    detalhe: 'Até 10 colaboradores',
    ate: 10,
    mensalidade: 'R$ 297,00',
    implantacao: 'Combinada pelo WhatsApp',
    total: 'R$ 297,00',
  },
  {
    chave: 'gestao',
    nome: 'Gestão',
    detalhe: '11 a 30 colaboradores',
    ate: 30,
    mensalidade: 'R$ 597,00',
    implantacao: 'Combinada pelo WhatsApp',
    total: 'R$ 597,00',
  },
  {
    chave: 'estrategico',
    nome: 'Estratégico',
    detalhe: '31 a 60 colaboradores',
    ate: 60,
    mensalidade: 'R$ 997,00',
    implantacao: 'Combinada pelo WhatsApp',
    total: 'R$ 997,00',
  },
];
const ASSINATURA = (extra = {}) => ({
  status: 'agendada',
  plano: { chave: 'essencial', nome: 'Essencial', detalhe: 'Até 10 colaboradores' },
  mensalidade: 'R$ 297,00',
  implantacao: 'Combinada pelo WhatsApp',
  total: 'R$ 297,00',
  primeiraCobrancaEm: '2026-11-17',
  primeiraCobrancaEmBR: '17/11/2026',
  diasParaCobranca: 7,
  link: null,
  linkIndisponivel: false,
  whatsapp: 'https://wa.me/558999857062?text=Ol%C3%A1',
  podeTrocarPlano: true,
  podeCancelar: true,
  aceiteTexto: 'Plano Essencial: tudo combinado.',
  pagoEm: null,
  canceladaEm: null,
  ...extra,
});
const RESUMO = (extra = {}) => ({
  ativa: true,
  assinatura: null,
  planos: PLANOS,
  trialAte: '2026-11-17',
  ehPagante: false,
  ...extra,
});

// cenário: o módulo real + servidor simulado
function cenario({ ligada = true, resposta = RESUMO(), colaboradores = 0, confirma = true } = {}) {
  const ctx = carregarArquivos(['js/02-core-helpers.js', 'js/59-cobranca.js'], {
    colaboradores: Array.from({ length: colaboradores }, (_, i) => ({ id: i })),
  });
  const reg = {
    chamadas: [],
    toasts: [],
    renders: 0,
    agendados: [],
    confirmacoes: [],
    auditorias: [],
    recarregouSuperAdmin: 0,
  };
  vm.runInContext(`state.colaboradores = Array.from({ length: ${Number(colaboradores)} }, (_, i) => ({ id: i }))`, ctx); // o state do js/02 sombreia o da caixa de areia
  ctx.window.NORTE_AMBIENTE = { cobrancaAtiva: ligada };
  ctx.render = () => reg.renders++;
  ctx.showToast = (m) => reg.toasts.push(m);
  ctx.registrarAuditoria = (a, d) => reg.auditorias.push([a, d]);
  ctx.setTimeout = (fn) => reg.agendados.push(fn);
  ctx.confirm = (msg) => (reg.confirmacoes.push(msg), typeof confirma === 'function' ? confirma(msg) : confirma);
  ctx.carregarDadosSuperAdmin = async () => reg.recarregouSuperAdmin++;
  let respostas = typeof resposta === 'function' ? resposta : () => resposta;
  ctx.sb = {
    functions: {
      invoke: async (nome, { body }) => {
        reg.chamadas.push([nome, plano(body)]);
        const r = respostas(body);
        if (r instanceof Error)
          return {
            data: null,
            error: {
              message: 'Edge Function returned a non-2xx status code',
              context: { json: async () => ({ error: r.message }) },
            },
          };
        return { data: r, error: null };
      },
    },
  };
  const estado = () => plano(vm.runInContext('cobrancaEstado', ctx));
  const carregar = async () => {
    await ctx.cobrancaCarregar(true);
    return ctx.blocoCobrancaHtml();
  };
  return {
    ctx,
    reg,
    estado,
    carregar,
    rodar: (c) => vm.runInContext(c, ctx),
    definirResposta: (f) => (respostas = typeof f === 'function' ? f : () => f),
  };
}

// ======================= pedaços puros =======================
test('a cobrança só liga com cobrancaAtiva === true (não vale texto "true", nem 1, nem ausente)', () => {
  for (const [valor, esperado] of [
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [undefined, false],
    [null, false],
  ]) {
    const c = carregarArquivos(['js/59-cobranca.js']);
    c.window.NORTE_AMBIENTE = { cobrancaAtiva: valor };
    assert.equal(c.cobrancaLigada(), esperado, String(valor));
  }
  const semAmbiente = carregarArquivos(['js/59-cobranca.js']);
  assert.equal(semAmbiente.cobrancaLigada(), false);
});

test('dinheiro em reais no navegador é IGUAL ao da função cobranca (a mesma conta nos dois lugares)', () => {
  const c = carregarArquivos(['js/59-cobranca.js']);
  const fonte = ler('supabase/functions/cobranca/index.ts');
  const ctx = vm.createContext({ String, Math, Number });
  vm.runInContext(
    nodeModule.stripTypeScriptTypes(
      fonte.slice(
        fonte.indexOf('function formatarReais('),
        fonte.indexOf('// A data (AAAA-MM-DD) no horário de Brasília')
      )
    ),
    ctx
  );
  for (const v of [0, 5, 99, 100, 29700, 59000, 88700, 158700, 248700, 99999, 100000, 123456789])
    assert.equal(c.cobrancaReais(v), ctx.formatarReais(v), String(v));
  assert.equal(c.cobrancaReais('lixo'), 'R$ 0,00');
});

test('link de pagamento: só https, sem espaço, aspas ou sinais de HTML; qualquer outra coisa vira vazio (e o botão nem aparece)', () => {
  const c = carregarArquivos(['js/59-cobranca.js']);
  assert.equal(
    c.cobrancaLinkSeguro('https://pague.exemplo.com/essencial-887?x=1'),
    'https://pague.exemplo.com/essencial-887?x=1'
  );
  for (const ruim of [
    'http://inseguro.com/a',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'https://x.com/a b',
    'https://x.com/"onclick="1',
    "https://x.com/'a",
    'https://x.com/<a>',
    '',
    null,
    undefined,
    '//x.com/a',
    'ftp://x.com',
  ])
    assert.equal(c.cobrancaLinkSeguro(ruim), '', String(ruim));
});

test('o plano sugerido para a quantidade de colaboradores: bordas 10/11, 30/31, 60/61 e entradas inválidas', () => {
  const c = carregarArquivos(['js/59-cobranca.js']);
  const f = (n) => c.cobrancaSugerirPlano(PLANOS, n);
  assert.deepEqual([1, 10, 11, 30, 31, 60].map(f), [
    'essencial',
    'essencial',
    'gestao',
    'gestao',
    'estrategico',
    'estrategico',
  ]);
  for (const n of [61, 0, -1, NaN, undefined]) assert.equal(f(n), null, String(n));
  assert.equal(c.cobrancaSugerirPlano(null, 5), null);
});

// ======================= a tela do Administrador =======================
test('cobrança DESLIGADA: a tela não mostra nada e o servidor nem é chamado', async () => {
  const t = cenario({ ligada: false });
  assert.equal(t.ctx.blocoCobrancaHtml(), '');
  await t.ctx.cobrancaCarregar(true);
  assert.deepEqual([t.reg.chamadas.length, t.reg.agendados.length], [0, 0]);
  assert.equal(await t.ctx.cobrancaDadosParaBloqueio(), null);
  assert.equal(t.reg.chamadas.length, 0);
});

test('ligada e ainda carregando: mostra "Carregando" e agenda UMA carga; depois da carga, desenha o bloco', async () => {
  const t = cenario();
  const html = t.ctx.blocoCobrancaHtml();
  assert.ok(html.includes('Carregando'));
  assert.equal(t.reg.agendados.length, 1);
  await t.reg.agendados[0]();
  assert.deepEqual(t.reg.chamadas, [['cobranca', { action: 'resumo' }]]);
  assert.ok(t.reg.renders >= 1, 'pediu para redesenhar a tela');
  await t.ctx.cobrancaCarregar(false); // já carregado: não chama de novo
  assert.equal(t.reg.chamadas.length, 1);
});

test('sem plano escolhido: mostra os 3 planos com os valores, destaca o da equipe e repete que nada é cobrado automaticamente', async () => {
  const t = cenario({ colaboradores: 12 });
  const html = await t.carregar();
  for (const x of [
    'Escolha o plano da sua empresa',
    '17/11/2026',
    'Essencial',
    'Gestão',
    'Estratégico',
    'R$ 297,00',
    'R$ 597,00',
    'R$ 997,00',
    'Combinada pelo WhatsApp',
    'Combinada pelo WhatsApp',
    'Combinada pelo WhatsApp',
    'R$ 297,00',
    'R$ 597,00',
    'R$ 997,00',
    'Nada é cobrado automaticamente',
    'seus dados ficam guardados',
  ])
    assert.ok(html.includes(x), x);
  assert.equal((html.match(/Sugerido para a sua equipe/g) || []).length, 1);
  assert.ok(
    /Sugerido para a sua equipe<\/span>\s*<div class="small-muted">Gestão/.test(html),
    '12 colaboradores: o sugerido é o Gestão'
  );
  assert.deepEqual(
    [...html.matchAll(/cobrancaEscolherPlano\('([a-z]*)'\)/g)].map((m) => m[1]),
    ['essencial', 'gestao', 'estrategico']
  );
  assert.ok(
    !/fidelidade|cartão de crédito|débito automático/i.test(html.replace('sem fidelidade', '')),
    'a tela não promete o que não existe'
  );
});

test('empresa que já é cliente, ou que não está em teste, e ainda não tem assinatura: nada a escolher', async () => {
  assert.equal(await cenario({ resposta: RESUMO({ ehPagante: true }) }).carregar(), '');
  assert.equal(await cenario({ resposta: RESUMO({ trialAte: null }) }).carregar(), '');
  assert.equal(await cenario({ resposta: { ativa: false } }).carregar(), '');
});

test('erro ao carregar (servidor ainda não pronto): o bloco simplesmente NÃO aparece, sem mensagem de erro para o cliente, e o motivo fica registrado', async () => {
  const t = cenario({ resposta: () => new Error('Só o Administrador vê isto') });
  const html = await t.carregar();
  assert.equal(html, '', 'ligar o site antes do servidor não pode mostrar erro ao cliente');
  assert.equal(t.estado().erro, 'Só o Administrador vê isto');
  assert.deepEqual(plano(t.reg.chamadas), [['cobranca', { action: 'resumo' }]]);
});
test('assinatura agendada, ainda sem link: plano, valores, data, quando o link aparece, trocar e cancelar; sem botão de pagar', async () => {
  const html = await cenario({ resposta: RESUMO({ assinatura: ASSINATURA() }) }).carregar();
  for (const x of [
    'Sua assinatura: plano Essencial',
    'Pagamento no fim do teste',
    '17/11/2026',
    'daqui a 7 dias',
    'R$ 297,00',
    'R$ 297,00',
    'sem fidelidade',
    'Combinada pelo WhatsApp',
    '3 dias antes do fim do teste',
    'Trocar de plano',
    'Cancelar assinatura',
    'O que foi combinado',
    'Plano Essencial: tudo combinado.',
  ])
    assert.ok(html.includes(x), x);
  assert.ok(!html.includes('Pagar R$') && !html.includes('Pedir o link'));
});

test('implantação combinada por WhatsApp: o cartão do plano e a assinatura dizem isso, e o primeiro pagamento é só a primeira mensalidade', async () => {
  const sem = await cenario({ resposta: RESUMO() }).carregar();
  assert.equal((sem.match(/Implantação: Combinada pelo WhatsApp/g) || []).length, 3);
  assert.ok(!/R\$ 590|R\$ 990|R\$ 1\.490/.test(sem));
  const com = await cenario({ resposta: RESUMO({ assinatura: ASSINATURA() }) }).carregar();
  assert.ok(
    com.includes('(a primeira mensalidade)') &&
      !com.includes('(implantação e primeira mensalidade)') &&
      com.includes('Combinada pelo WhatsApp')
  );
  const comValor = await cenario({
    resposta: RESUMO({ assinatura: ASSINATURA({ implantacao: 'R$ 590,00', total: 'R$ 887,00' }) }),
  }).carregar();
  assert.ok(comValor.includes('(implantação e primeira mensalidade)') && comValor.includes('R$ 590,00'));
});

test('com o link na janela de pagamento: botão "Pagar" abre o link em outra aba, com noopener', async () => {
  const html = await cenario({
    resposta: RESUMO({
      assinatura: ASSINATURA({ link: 'https://pague.exemplo.com/essencial-887', diasParaCobranca: 2 }),
    }),
  }).carregar();
  assert.ok(
    /<a class="btn btn-primary" href="https:\/\/pague\.exemplo\.com\/essencial-887" target="_blank" rel="noopener" style="text-decoration:none;">Pagar R\$ 297,00 agora<\/a>/.test(
      html
    )
  );
});

test('teste terminado e aguardando pagamento: pede o pagamento; sem link cadastrado, oferece o WhatsApp em vez de um botão quebrado', async () => {
  const com = await cenario({
    resposta: RESUMO({
      assinatura: ASSINATURA({
        status: 'aguardando_pagamento',
        diasParaCobranca: -1,
        link: 'https://pague.exemplo.com/essencial-887',
      }),
    }),
  }).carregar();
  assert.ok(
    com.includes('Aguardando pagamento') &&
      com.includes('Seu teste terminou') &&
      com.includes('Seus dados continuam guardados') &&
      com.includes('Pagar R$ 297,00 agora')
  );
  const sem = await cenario({
    resposta: RESUMO({ assinatura: ASSINATURA({ status: 'aguardando_pagamento', linkIndisponivel: true }) }),
  }).carregar();
  assert.ok(
    sem.includes('Pedir o link no WhatsApp') &&
      sem.includes('wa.me/558999857062') &&
      !sem.includes('Pagar R$ 297,00 agora')
  );
});

test('assinatura ativa: mostra o pagamento confirmado, não oferece pagar nem trocar de plano, e ainda deixa cancelar', async () => {
  const html = await cenario({
    resposta: RESUMO({
      assinatura: ASSINATURA({ status: 'ativa', pagoEm: '2026-11-10T15:00:00Z', podeTrocarPlano: false, link: null }),
    }),
  }).carregar();
  assert.ok(html.includes('Ativa') && html.includes('Pagamento confirmado em 10/11/2026'));
  assert.ok(!html.includes('Trocar de plano') && !html.includes('Pagar R$') && html.includes('Cancelar assinatura'));
});

test('assinatura cancelada: avisa quando cancelou e deixa escolher o plano de novo', async () => {
  const html = await cenario({
    resposta: RESUMO({
      assinatura: ASSINATURA({ status: 'cancelada', canceladaEm: '2026-11-12T10:00:00Z', podeCancelar: false }),
    }),
  }).carregar();
  assert.ok(
    html.includes('Assinatura cancelada') &&
      html.includes('Cancelada em 12/11/2026') &&
      html.includes('Escolher este plano')
  );
  assert.ok(!html.includes('Cancelar assinatura'));
});

test('tudo que vem do servidor entra escapado, e um link perigoso nunca vira botão', async () => {
  const ruim = '<img src=x onerror=alert(1)>';
  const html = await cenario({
    resposta: RESUMO({
      assinatura: ASSINATURA({
        aceiteTexto: ruim,
        total: ruim,
        mensalidade: ruim,
        plano: { chave: 'essencial', nome: ruim, detalhe: ruim },
        link: 'javascript:alert(1)',
        linkIndisponivel: false,
      }),
    }),
  }).carregar();
  assert.ok(!html.includes('<img src=x'), 'HTML do servidor virou elemento');
  assert.ok(!/href="javascript:/i.test(html) && !html.includes('Pagar R$'));
  const comAspas = await cenario({
    resposta: RESUMO({ assinatura: ASSINATURA({ link: 'https://x.com/"onclick="alert(1)' }) }),
  }).carregar();
  assert.ok(!comAspas.includes('onclick="alert') && !comAspas.includes('Pagar R$'));
});

// ======================= as ações =======================
test('escolher o plano: pede confirmação com os valores, manda SÓ o plano ao servidor, guarda o resumo devolvido e avisa', async () => {
  const t = cenario({ resposta: (b) => (b.action === 'resumo' ? RESUMO() : { ok: true, resumo: ASSINATURA() }) });
  await t.carregar();
  await t.ctx.cobrancaEscolherPlano('essencial');
  assert.ok(
    t.reg.confirmacoes[0].includes('plano Essencial') &&
      t.reg.confirmacoes[0].includes('R$ 297,00') &&
      t.reg.confirmacoes[0].includes('R$ 297,00') &&
      t.reg.confirmacoes[0].includes('Nada é cobrado automaticamente')
  );
  assert.deepEqual(t.reg.chamadas.at(-1), ['cobranca', { action: 'escolher_plano', plano: 'essencial' }]);
  assert.equal(t.estado().dados.assinatura.status, 'agendada');
  assert.deepEqual(plano([t.reg.toasts.at(-1), t.reg.auditorias.at(-1)]), [
    'Plano Essencial registrado.',
    ['cobranca.plano_escolhido', { plano: 'essencial' }],
  ]);
  assert.ok(t.ctx.blocoCobrancaHtml().includes('Sua assinatura: plano Essencial'));
});

test('escolher o plano: se a pessoa não confirmar, plano inventado ou chave estranha, nada é enviado', async () => {
  const t = cenario({ confirma: false });
  await t.carregar();
  const antes = t.reg.chamadas.length;
  await t.ctx.cobrancaEscolherPlano('essencial'); // não confirmou
  await t.ctx.cobrancaEscolherPlano('premium'); // não existe na lista
  await t.ctx.cobrancaEscolherPlano("essencial'); alert('x"); // chave com código
  await t.ctx.cobrancaEscolherPlano(undefined);
  assert.equal(t.reg.chamadas.length, antes);
});

test('escolher o plano com erro do servidor: mostra a explicação em português e não muda a tela', async () => {
  const t = cenario({
    resposta: (b) =>
      b.action === 'resumo' ? RESUMO() : new Error('O plano não pode mais ser trocado por aqui. Fale com a gente.'),
  });
  await t.carregar();
  await t.ctx.cobrancaEscolherPlano('gestao');
  assert.equal(
    t.reg.toasts.at(-1),
    'Não foi possível registrar o plano: O plano não pode mais ser trocado por aqui. Fale com a gente.'
  );
  assert.equal(t.estado().dados.assinatura, null);
});

test('trocar de plano: o botão abre/fecha os cartões e eles trazem o plano atual destacado', async () => {
  const t = cenario({ resposta: RESUMO({ assinatura: ASSINATURA() }) });
  await t.carregar();
  assert.ok(!t.ctx.blocoCobrancaHtml().includes('Escolher este plano'));
  t.ctx.cobrancaAlternarTroca();
  const aberto = t.ctx.blocoCobrancaHtml();
  assert.ok(
    aberto.includes('Escolher este plano') &&
      /Sugerido para a sua equipe<\/span>\s*<div class="small-muted">Essencial/.test(aberto)
  );
  t.ctx.cobrancaAlternarTroca();
  assert.ok(!t.ctx.blocoCobrancaHtml().includes('Escolher este plano'));
});

test('cancelar: avisa o que acontece, manda a ação, mostra a assinatura cancelada; já cancelada ou sem permissão não chama nada', async () => {
  const t = cenario({
    resposta: (b) =>
      b.action === 'resumo'
        ? RESUMO({ assinatura: ASSINATURA() })
        : {
            ok: true,
            resumo: ASSINATURA({ status: 'cancelada', canceladaEm: '2026-11-12T10:00:00Z', podeCancelar: false }),
          },
  });
  await t.carregar();
  await t.ctx.cobrancaCancelar();
  assert.ok(
    t.reg.confirmacoes[0].includes('Cancelar a assinatura do plano Essencial') &&
      t.reg.confirmacoes[0].includes('o acesso é pausado e seus dados ficam guardados')
  );
  assert.deepEqual(t.reg.chamadas.at(-1), ['cobranca', { action: 'cancelar' }]);
  assert.equal(t.estado().dados.assinatura.status, 'cancelada');
  assert.equal(t.reg.toasts.at(-1), 'Assinatura cancelada.');
  const antes = t.reg.chamadas.length;
  await t.ctx.cobrancaCancelar(); // já cancelada
  assert.equal(t.reg.chamadas.length, antes);
});

test('cancelar uma assinatura já paga fala em devolução (sem prometer reembolso) e quem desistir de confirmar não cancela', async () => {
  const t = cenario({
    resposta: RESUMO({ assinatura: ASSINATURA({ status: 'ativa', podeTrocarPlano: false }) }),
    confirma: false,
  });
  await t.carregar();
  await t.ctx.cobrancaCancelar();
  assert.ok(
    t.reg.confirmacoes[0].includes('devolução de valores, fale com a gente') && !/reembols/i.test(t.reg.confirmacoes[0])
  );
  assert.equal(t.reg.chamadas.filter(([, b]) => b.action === 'cancelar').length, 0);
});

// ======================= o bloqueio do 8º dia =======================
test('bloqueio do 8º dia: devolve o link e o valor só quando há assinatura aguardando pagamento com link seguro', async () => {
  const dados = (a) => cenario({ resposta: RESUMO({ assinatura: a }) });
  const bom = await dados(
    ASSINATURA({ status: 'aguardando_pagamento', link: 'https://pague.exemplo.com/essencial-887' })
  ).ctx.cobrancaDadosParaBloqueio();
  assert.deepEqual(plano(bom), { link: 'https://pague.exemplo.com/essencial-887', total: 'R$ 297,00' });
  for (const a of [
    null,
    ASSINATURA({ status: 'cancelada', link: 'https://pague.exemplo.com/essencial-887' }), // com link, mas cancelada: não oferece pagar
    ASSINATURA({ status: 'ativa', link: 'https://pague.exemplo.com/essencial-887' }), // com link, mas já paga: não oferece pagar
    ASSINATURA({ link: null }),
    ASSINATURA({ link: 'javascript:alert(1)' }),
    ASSINATURA({ link: 'http://inseguro.com/x' }),
  ])
    assert.equal(await dados(a).ctx.cobrancaDadosParaBloqueio(), null, J(a && [a.status, a.link]));
});

test('bloqueio do 8º dia: erro do servidor ou demora (mais de 4 s) NÃO trava a entrada: devolve null e a tela segue só com o WhatsApp', async () => {
  const erro = cenario({ resposta: () => new Error('falhou') });
  assert.equal(await erro.ctx.cobrancaDadosParaBloqueio(), null);
  const lento = cenario();
  lento.ctx.setTimeout = (fn) => fn(); // o relógio "passa" na hora
  lento.ctx.sb.functions.invoke = () => new Promise(() => {}); // o servidor nunca responde
  assert.equal(await lento.ctx.cobrancaDadosParaBloqueio(), null);
});

// ======================= Super Admin =======================
const ASSINATURAS_SA = [
  {
    empresa_id: 'e1',
    plano: 'essencial',
    status: 'aguardando_pagamento',
    primeira_cobranca_centavos: 29700,
    primeira_cobranca_em: '2026-11-17',
  },
  {
    empresa_id: 'e2',
    plano: 'gestao',
    status: 'ativa',
    primeira_cobranca_centavos: 59700,
    primeira_cobranca_em: '2026-11-10',
  },
  {
    empresa_id: 'e3',
    plano: 'estrategico',
    status: 'cancelada',
    primeira_cobranca_centavos: 99700,
    primeira_cobranca_em: '2026-11-20',
  },
  {
    empresa_id: 'e4',
    plano: '<img src=x>',
    status: 'agendada',
    primeira_cobranca_centavos: 29700,
    primeira_cobranca_em: '2026-11-17',
  },
];
test('Super Admin: a situação da cobrança aparece na linha da empresa (plano, situação, valor, data), escapada; empresa sem assinatura: nada', () => {
  const t = cenario();
  t.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  assert.equal(
    t.ctx.cobrancaSeloSuperAdmin('e1'),
    '<div class="small-muted" style="font-size:11px;margin-top:4px;">Cobrança: Essencial · Aguardando pagamento · R$ 297,00 · até 17/11/2026</div>'
  );
  assert.ok(t.ctx.cobrancaSeloSuperAdmin('e2').includes('Gestão · Ativa · R$ 597,00'));
  assert.equal(t.ctx.cobrancaSeloSuperAdmin('sem-assinatura'), '');
  assert.ok(!t.ctx.cobrancaSeloSuperAdmin('e4').includes('<img src=x>'));
});

test('Super Admin: o botão "Confirmar pagamento" só aparece para assinatura que ainda não foi paga nem cancelada', () => {
  const t = cenario();
  t.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  assert.deepEqual(
    ['e1', 'e2', 'e3', 'e4', 'nenhuma'].map((id) =>
      t.ctx.cobrancaBotaoConfirmar(id, 'Empresa').includes('Confirmar pagamento')
    ),
    [true, false, false, true, false]
  );
  assert.deepEqual(
    ['agendada', 'aguardando_pagamento', 'ativa', 'em_atraso', 'suspensa', 'cancelada'].map((s) =>
      t.ctx.cobrancaPodeConfirmar(s)
    ),
    [true, true, false, true, true, false]
  );
  const b = t.ctx.cobrancaBotaoConfirmar('e1', 'D\'Avila & Cia "X"');
  assert.ok(!b.includes("D'Avila"), 'o nome com aspa não pode quebrar o onclick');
});

test('Super Admin: com assinatura pendente o botão antigo "Marcar como pagante" some (o certo é "Confirmar pagamento")', () => {
  const t = cenario();
  t.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  assert.deepEqual(
    ['e1', 'e2', 'e3', 'e4', 'nenhuma'].map((id) => t.ctx.cobrancaTemAssinaturaPendente(id)),
    [true, false, false, true, false]
  );
  const sa = ler('js/23-page-super-admin.js');
  assert.ok(
    /!e\.is_pagante && e\.trial_ate && !cobrancaTemAssinaturaPendente\(e\.id\)/.test(sa),
    'o botão antigo precisa sumir quando há assinatura pendente'
  );
});

test('Super Admin: confirmar pede confirmação com o valor, chama a ação e recarrega a lista; recusar ou falhar não recarrega', async () => {
  const t = cenario({ resposta: { ok: true } });
  t.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  await t.ctx.confirmarPagamentoCobranca('e1', 'Loja Aurora');
  assert.ok(
    t.reg.confirmacoes[0].includes('"Loja Aurora" pagou R$ 297,00') &&
      t.reg.confirmacoes[0].includes('empresa passa a ser cliente')
  );
  assert.deepEqual(t.reg.chamadas.at(-1), ['cobranca', { action: 'confirmar_pagamento', empresa_id: 'e1' }]);
  assert.deepEqual(
    [t.reg.recarregouSuperAdmin, t.reg.toasts.at(-1)],
    [1, 'Pagamento de "Loja Aurora" confirmado: acesso liberado.']
  );
  const nao = cenario({ resposta: { ok: true }, confirma: false });
  nao.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  await nao.ctx.confirmarPagamentoCobranca('e1', 'X');
  assert.deepEqual([nao.reg.chamadas.length, nao.reg.recarregouSuperAdmin], [0, 0]);
  const falha = cenario({ resposta: () => new Error('Só o Super Admin confirma pagamentos.') });
  falha.ctx._superAdminAssinaturas = ASSINATURAS_SA;
  await falha.ctx.confirmarPagamentoCobranca('e1', 'X');
  assert.deepEqual(
    [falha.reg.recarregouSuperAdmin, falha.reg.toasts.at(-1)],
    [0, 'Não foi possível confirmar o pagamento: Só o Super Admin confirma pagamentos.']
  );
  await t.ctx.confirmarPagamentoCobranca('sem-assinatura', 'Y');
  assert.equal(t.reg.chamadas.filter(([, b]) => b.empresa_id === 'sem-assinatura').length, 0);
});

// ======================= o encaixe no sistema =======================
test('a tela de Pagamento inclui o bloco da cobrança (e continua funcionando com a cobrança desligada)', async () => {
  const ctx = carregarArquivos(['js/02-core-helpers.js', 'js/31-page-pagamento.js', 'js/59-cobranca.js'], {
    empresa: { faturamento: { plano: 'Essencial' } },
    colaboradores: [],
  });
  ctx.window.NORTE_AMBIENTE = { cobrancaAtiva: false };
  const desligada = ctx.pagePagamento();
  assert.ok(
    desligada.includes('Assinatura e pagamento') &&
      !desligada.includes('Sua assinatura: plano') &&
      !desligada.includes('Carregando')
  );
  ctx.window.NORTE_AMBIENTE = { cobrancaAtiva: true };
  ctx.setTimeout = () => {};
  assert.ok(ctx.pagePagamento().includes('Carregando'), 'ligada: o bloco aparece');
  const semModulo = carregarArquivos(['js/02-core-helpers.js', 'js/31-page-pagamento.js'], {
    empresa: { faturamento: {} },
  });
  assert.ok(semModulo.pagePagamento().includes('Assinatura e pagamento'), 'sem o módulo a tela continua igual');
});

test('o encaixe: a entrada busca o link ANTES de sair da sessão, o botão de pagar usa link escapado e o app carrega o módulo', () => {
  const auth = ler('js/19-auth.js');
  const i = auth.indexOf('await cobrancaDadosParaBloqueio()');
  const j = auth.indexOf('await sb.auth.signOut();', i);
  assert.ok(i > 0 && j > i, 'o link tem de vir antes do signOut (depois dele não há sessão)');
  assert.ok(/linkPagamentoLogin = pagamento \? pagamento\.link : null/.test(auth));
  assert.ok(
    /erroLogin && erroLogin === erroContratarLogin && linkPagamentoLogin/.test(auth) &&
      auth.includes('${escaparHtml(linkPagamentoLogin)}')
  );
  assert.ok(auth.includes('Pagar agora e continuar'));
  const sa = ler('js/23-page-super-admin.js');
  assert.ok(
    sa.includes('let _superAdminAssinaturas = []') &&
      sa.includes('cobrancaSeloSuperAdmin(e.id)') &&
      sa.includes('cobrancaBotaoConfirmar(e.id, e.nome_fantasia)')
  );
  assert.ok(
    /cobrancaLigada\(\)\s*\?\s*sb\s*\.from\('assinaturas'\)/.test(sa),
    'só consulta as assinaturas com a cobrança ligada'
  );
  const app = ler('app.html');
  assert.ok(
    app.indexOf('js/59-cobranca.js') > app.indexOf('js/58-teste-gratis.js') &&
      app.indexOf('js/59-cobranca.js') > app.indexOf('js/31-page-pagamento.js')
  );
});

test('a chave cobrancaAtiva existe no ambiente (liga só quando o servidor também estiver pronto) e o ambiente de testes nunca a liga', () => {
  const amb = (href) => {
    const ctx = vm.createContext({ URL, location: { href }, window: undefined });
    ctx.globalThis = ctx;
    vm.runInContext(ler('ambiente.js'), ctx);
    return plano(ctx.NORTE_AMBIENTE);
  };
  const prod = amb('https://sistema.inetris.com.br/');
  const teste = amb('https://teste.inetris.com.br/');
  assert.equal(typeof prod.cobrancaAtiva, 'boolean');
  assert.equal(teste.cobrancaAtiva, false);
  assert.ok(ler('ambiente.js').includes('cobrancaAtiva: base.cobrancaAtiva === true'), 'só vale o booleano true');
});

// ======================= o ciclo mensal (depois do primeiro pagamento) =======================
const MENSAL = (extra = {}) =>
  ASSINATURA({
    ciclo: 'mensalidade',
    status: 'ativa',
    cicloEm: '2026-12-10',
    cicloEmBR: '10/12/2026',
    suspensaoEmBR: '17/12/2026',
    diasParaCobranca: 30,
    pagoEm: '2026-11-10T15:00:00Z',
    podeTrocarPlano: false,
    ...extra,
  });

test('assinatura ativa, longe do vencimento: diz quando vence a próxima mensalidade e que o link chega por e-mail 3 dias antes; sem botão de pagar', async () => {
  const html = await cenario({ resposta: RESUMO({ assinatura: MENSAL() }) }).carregar();
  for (const x of [
    'Pagamento confirmado em 10/11/2026',
    'A próxima mensalidade vence em <b>10/12/2026</b>',
    'o link de pagamento chega no seu e-mail 3 dias antes',
    'Próximo pagamento',
    'Cancelar assinatura',
  ])
    assert.ok(html.includes(x), x);
  assert.ok(!html.includes('Pagar R$') && !html.includes('Primeiro pagamento') && !html.includes('Trocar de plano'));
});

test('assinatura ativa perto do vencimento: mostra o valor, a data e o botão de pagar com o link da mensalidade', async () => {
  const html = await cenario({
    resposta: RESUMO({
      assinatura: MENSAL({
        cicloEmBR: '12/11/2026',
        diasParaCobranca: 2,
        link: 'https://pague.exemplo.com/essencial-mensal',
      }),
    }),
  }).carregar();
  assert.ok(html.includes('A próxima mensalidade (<b>R$ 297,00</b>) vence em <b>12/11/2026</b> (daqui a 2 dias)'));
  assert.ok(/href="https:\/\/pague\.exemplo\.com\/essencial-mensal"[^>]*>Pagar R\$ 297,00 agora<\/a>/.test(html));
});

test('mensalidade em atraso: diz até quando pagar para evitar a suspensão; suspensa: explica e oferece pagar', async () => {
  const atraso = await cenario({
    resposta: RESUMO({
      assinatura: MENSAL({
        status: 'em_atraso',
        cicloEmBR: '07/11/2026',
        suspensaoEmBR: '14/11/2026',
        diasParaCobranca: -3,
        link: 'https://pague.exemplo.com/essencial-mensal',
      }),
    }),
  }).carregar();
  assert.ok(
    atraso.includes('Em atraso') &&
      atraso.includes('vencida em 07/11/2026') &&
      atraso.includes('Pague até <b>14/11/2026</b> para evitar a suspensão do acesso') &&
      atraso.includes('Seus dados continuam guardados') &&
      atraso.includes('Pagar R$ 297,00 agora')
  );
  const suspensa = await cenario({
    resposta: RESUMO({
      assinatura: MENSAL({
        status: 'suspensa',
        cicloEmBR: '03/11/2026',
        link: 'https://pague.exemplo.com/essencial-mensal',
      }),
    }),
  }).carregar();
  assert.ok(
    suspensa.includes('O acesso está suspenso por falta de pagamento') &&
      suspensa.includes('mensalidade vencida em 03/11/2026') &&
      suspensa.includes('Pagar R$ 297,00 agora')
  );
});

test('mensalidade vencendo hoje (aguardando pagamento): pede o pagamento do valor da mensalidade', async () => {
  const html = await cenario({
    resposta: RESUMO({
      assinatura: MENSAL({
        status: 'aguardando_pagamento',
        cicloEmBR: '10/11/2026',
        diasParaCobranca: 0,
        link: 'https://pague.exemplo.com/essencial-mensal',
      }),
    }),
  }).carregar();
  assert.ok(
    html.includes('A mensalidade de <b>R$ 297,00</b> vence em <b>10/11/2026</b>') &&
      html.includes('Pagar R$ 297,00 agora') &&
      !html.includes('Seu teste terminou')
  );
});

test('cancelou DEPOIS de pagar: o cartão diz até quando o acesso continua, sem opções de escolher plano nem de cancelar de novo', async () => {
  const html = await cenario({
    resposta: RESUMO({
      ehPagante: true,
      assinatura: MENSAL({
        status: 'cancelada',
        canceladaEm: '2026-11-12T10:00:00Z',
        cicloEmBR: '28/11/2026',
        podeCancelar: false,
      }),
    }),
  }).carregar();
  for (const x of [
    'Assinatura cancelada',
    'Cancelada em 12/11/2026',
    'O acesso continua até <b>28/11/2026</b>, o fim do período já pago',
    'seus dados continuam guardados',
  ])
    assert.ok(html.includes(x), x);
  assert.ok(!html.includes('Escolher este plano') && !html.includes('Cancelar assinatura'));
});

test('cancelar uma assinatura paga avisa até quando o acesso vale', async () => {
  const t = cenario({ resposta: RESUMO({ assinatura: MENSAL({ cicloEmBR: '10/12/2026' }) }), confirma: false });
  await t.carregar();
  await t.ctx.cobrancaCancelar();
  assert.ok(
    t.reg.confirmacoes[0].includes('O acesso continua até 10/12/2026, o fim do período já pago') &&
      t.reg.confirmacoes[0].includes('devolução de valores, fale com a gente')
  );
});

test('bloqueio: quem está em atraso ou suspenso recebe o link da mensalidade para pagar na hora', async () => {
  for (const status of ['aguardando_pagamento', 'em_atraso', 'suspensa']) {
    const t = cenario({
      resposta: RESUMO({ assinatura: MENSAL({ status, link: 'https://pague.exemplo.com/essencial-mensal' }) }),
    });
    assert.deepEqual(
      plano(await t.ctx.cobrancaDadosParaBloqueio()),
      { link: 'https://pague.exemplo.com/essencial-mensal', total: 'R$ 297,00' },
      status
    );
  }
});

const SA_MENSAL = [
  {
    empresa_id: 'p1',
    plano: 'essencial',
    status: 'ativa',
    primeira_cobranca_centavos: 29700,
    primeira_cobranca_em: '2026-10-10',
    ultima_cobranca_em: '2026-10-10',
    proxima_cobranca_em: '2026-11-12',
  },
  {
    empresa_id: 'p2',
    plano: 'gestao',
    status: 'ativa',
    primeira_cobranca_centavos: 59700,
    primeira_cobranca_em: '2026-10-10',
    ultima_cobranca_em: '2026-10-10',
    proxima_cobranca_em: '2026-12-10',
  },
  {
    empresa_id: 'p3',
    plano: 'essencial',
    status: 'em_atraso',
    primeira_cobranca_centavos: 29700,
    primeira_cobranca_em: '2026-09-10',
    ultima_cobranca_em: '2026-09-10',
    proxima_cobranca_em: '2026-11-07',
  },
];
test('Super Admin: assinatura ativa só pode ter o pagamento confirmado dentro da janela de 3 dias (pagamento adiantado), e a linha mostra o vencimento do ciclo', () => {
  const t = cenario();
  t.ctx.cobrancaHojeISO = () => '2026-11-10';
  t.ctx._superAdminAssinaturas = SA_MENSAL;
  assert.deepEqual(
    ['p1', 'p2', 'p3'].map((id) => t.ctx.cobrancaBotaoConfirmar(id, 'X').includes('Confirmar pagamento')),
    [true, false, true]
  );
  assert.deepEqual(
    ['p1', 'p2', 'p3'].map((id) => t.ctx.cobrancaTemAssinaturaPendente(id)),
    [true, false, true]
  );
  assert.ok(
    t.ctx.cobrancaSeloSuperAdmin('p1').includes('Ativa · R$ 297,00 · até 12/11/2026'),
    'mostra o vencimento da mensalidade, não a data do primeiro pagamento'
  );
  assert.ok(
    t.ctx.cobrancaSeloSuperAdmin('p3').includes('Em atraso') &&
      t.ctx.cobrancaSeloSuperAdmin('p3').includes('até 07/11/2026')
  );
  assert.equal(t.ctx.cobrancaPodeConfirmar('ativa'), false, 'só o texto da situação: ativa não vale sem as datas');
  assert.equal(t.ctx.cobrancaPodeConfirmar({ status: 'ativa', proxima_cobranca_em: '2026-11-13' }), true);
  assert.equal(t.ctx.cobrancaPodeConfirmar({ status: 'ativa', proxima_cobranca_em: '2026-11-14' }), false);
  assert.equal(t.ctx.cobrancaPodeConfirmar({ status: 'cancelada', proxima_cobranca_em: '2026-11-10' }), false);
});

test('o encaixe do ciclo mensal: a entrada busca o link também para quem está suspenso (antes de sair), e o Super Admin traz as datas do ciclo', () => {
  const auth = ler('js/19-auth.js');
  const i = auth.indexOf('empresaCheck?.acesso_suspenso');
  const bloco = auth.slice(i, auth.indexOf('renderLogin();', i));
  const a = bloco.indexOf('await cobrancaDadosParaBloqueio()');
  const b = bloco.indexOf('await sb.auth.signOut();');
  assert.ok(a > 0 && b > a, 'no bloqueio por suspensão o link vem antes de sair da sessão');
  assert.ok(
    /linkPagamentoLogin = pagamento \? pagamento\.link : null/.test(bloco) &&
      bloco.includes('suspenso por falta de pagamento')
  );
  assert.ok(bloco.includes('temporariamente suspenso'), 'sem link, a mensagem de sempre');
  const sa = ler('js/23-page-super-admin.js');
  assert.ok(sa.includes('primeira_cobranca_em, proxima_cobranca_em, ultima_cobranca_em'));
});
