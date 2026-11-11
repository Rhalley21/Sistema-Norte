// =========================================================================
// Cobrança, lado do SERVIDOR (supabase/functions/cobranca). Roda o CÓDIGO REAL da função, com tipos removidos, contra um banco
// falso em memória e com o relógio parado em 10/11/2026 (meio-dia em Brasília). Confere quem pode o quê, o aceite guardado,
// quando o link de pagamento aparece (e só o do plano da própria empresa), o cancelamento e a confirmação do pagamento.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');

const raiz = path.join(__dirname, '..');
const suporta = typeof nodeModule.stripTypeScriptTypes === 'function';
const opcoes = suporta ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const origem = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'cobranca', 'index.ts'), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

const AGORA = Date.parse('2026-11-10T15:00:00Z'); // 12:00 em Brasília
const DIA = 86400000;
const iso = (dias) => new Date(AGORA + dias * DIA).toISOString();
const ID = {
  empresaA: 'aaaaaaaa-0000-4000-8000-000000000001',
  empresaB: 'bbbbbbbb-0000-4000-8000-000000000001',
  ownerA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  rhA: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  desativadoA: 'aaaaaaaa-0000-4000-8000-0000000000a3',
  ownerB: 'bbbbbbbb-0000-4000-8000-0000000000b1',
  superAdmin: 'ffffffff-0000-4000-8000-0000000000f1',
};

// ---------- a lógica pura ----------
function logica() {
  const ini = origem.indexOf('// ---- LÓGICA DA COBRANÇA');
  const fim = origem.indexOf('// ---- fim: lógica da cobrança');
  assert.ok(ini >= 0 && fim > ini, 'não achei a lógica da cobrança');
  const ctx = vm.createContext({
    console,
    String,
    Array,
    Object,
    JSON,
    Set,
    Date,
    Math,
    Number,
    Intl,
    encodeURIComponent,
    Record: undefined,
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return { ctx, ler: (expr) => vm.runInContext(expr, ctx) };
}

// ---------- a função inteira, com banco falso ----------
function bancoFalso(seed = {}) {
  const t = {
    assinaturas: [],
    assinaturas_eventos: [],
    links_pagamento: [],
    perfis: [],
    empresas: [],
    super_admins: [],
    ...seed,
  };
  const unicas = { assinaturas: ['empresa_id'], assinaturas_eventos: ['empresa_id', 'tipo', 'chave'] };
  const acessos = []; // registra o que foi lido de cada tabela (para provar que o link de outro plano nunca é lido)
  function from(nome) {
    const q = { filtros: [], patch: null };
    const linhas = () => t[nome].filter((r) => q.filtros.every(([c, v]) => r[c] === v));
    const api = {
      select() {
        return api;
      },
      eq(c, v) {
        q.filtros.push([c, v]);
        acessos.push([nome, c, v]);
        return api;
      },
      async maybeSingle() {
        const l = linhas();
        return { data: l[0] ? { ...l[0] } : null, error: null };
      },
      insert(linha) {
        const chaves = unicas[nome] || [];
        if (chaves.length && t[nome].some((r) => chaves.every((c) => r[c] === linha[c])))
          return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } });
        t[nome].push({ ...linha });
        return Promise.resolve({ error: null });
      },
      upsert(linha, { onConflict }) {
        const existente = t[nome].find((r) => r[onConflict] === linha[onConflict]);
        if (existente) Object.assign(existente, linha);
        else t[nome].push({ ...linha });
        return Promise.resolve({ error: null });
      },
      update(patch) {
        q.patch = patch;
        return api;
      },
      then(resolve) {
        if (q.patch) {
          linhas().forEach((r) => Object.assign(r, q.patch));
          resolve({ error: null });
        } else resolve({ data: linhas().map((r) => ({ ...r })), error: null });
      },
    };
    return api;
  }
  return { from, t, acessos };
}
const SEED = () => ({
  empresas: [
    { id: ID.empresaA, trial_ate: iso(7), is_pagante: false, acesso_suspenso: false },
    { id: ID.empresaB, trial_ate: iso(7), is_pagante: false, acesso_suspenso: false },
  ],
  perfis: [
    { id: ID.ownerA, empresa_id: ID.empresaA, papel: 'owner', desativado: false },
    { id: ID.rhA, empresa_id: ID.empresaA, papel: 'rh', desativado: false },
    { id: ID.desativadoA, empresa_id: ID.empresaA, papel: 'owner', desativado: true },
    { id: ID.ownerB, empresa_id: ID.empresaB, papel: 'owner', desativado: false },
  ],
  super_admins: [{ id: ID.superAdmin }],
  links_pagamento: [
    { plano: 'essencial', tipo: 'primeira', url: 'https://pague.exemplo.com/essencial-887' },
    { plano: 'essencial', tipo: 'mensalidade', url: 'https://pague.exemplo.com/essencial-mensal' },
    { plano: 'gestao', tipo: 'mensalidade', url: 'https://pague.exemplo.com/gestao-mensal' },
    { plano: 'gestao', tipo: 'primeira', url: 'https://pague.exemplo.com/gestao-1587' },
    { plano: 'estrategico', tipo: 'primeira', url: 'https://pague.exemplo.com/estrategico-2487' },
  ],
});
function montarFuncao({ ativa = true, seed = SEED(), relogio = AGORA } = {}) {
  let handler;
  const banco = bancoFalso(seed);
  const usuarios = new Set([ID.ownerA, ID.rhA, ID.desativadoA, ID.ownerB, ID.superAdmin]);
  const ambiente = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'servico',
    COBRANCA_ATIVA: ativa ? 'true' : 'false',
  };
  class DataFixa extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(relogio);
    }
    static now() {
      return relogio;
    }
  }
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    String,
    Array,
    Object,
    JSON,
    Set,
    Math,
    Number,
    Promise,
    Intl,
    RegExp,
    encodeURIComponent,
    Response,
    Date: DataFixa,
    serve: (h) => {
      handler = h;
    },
    createClient: (url, chave, opcoesCliente) => {
      if (opcoesCliente && opcoesCliente.global) {
        const token = String(opcoesCliente.global.headers.Authorization || '').replace(/^Bearer\s+/i, '');
        return { auth: { getUser: async () => ({ data: { user: usuarios.has(token) ? { id: token } : null } }) } };
      }
      return banco;
    },
    Deno: { env: { get: (k) => ambiente[k] } },
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.replace(/^import .*$/gm, '')), ctx);
  assert.equal(typeof handler, 'function');
  async function chamar(corpo, quem) {
    const req = {
      method: 'POST',
      headers: { get: (k) => (k.toLowerCase() === 'authorization' && quem ? `Bearer ${quem}` : null) },
      json: async () => (corpo instanceof Error ? Promise.reject(corpo) : corpo),
    };
    const resp = await handler(req);
    const texto = await resp.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch (_) {}
    return { status: resp.status, json, texto };
  }
  return { chamar, banco, avancar: (ms) => (relogio += ms) }; // o relógio de teste pode avançar entre as chamadas
}

// ======================= a lógica pura =======================
test('dinheiro em reais, a partir de centavos inteiros', opcoes, () => {
  const { ler } = logica();
  const f = (c) => ler(`formatarReais(${c})`);
  assert.equal(f(88700), 'R$ 887,00');
  assert.equal(f(158700), 'R$ 1.587,00');
  assert.equal(f(248700), 'R$ 2.487,00');
  assert.equal(f(29700), 'R$ 297,00');
  assert.equal(f(5), 'R$ 0,05');
  assert.equal(f(0), 'R$ 0,00');
  assert.equal(f(123456789), 'R$ 1.234.567,89');
});

test(
  'a tabela de planos: só a mensalidade (sem fidelidade); a implantação é combinada por WhatsApp e NÃO entra no pagamento (297, 597 e 997 reais)',
  opcoes,
  () => {
    const { ler } = logica();
    const planos = plano(ler('PLANOS'));
    assert.deepEqual(
      planos.map((p) => [p.chave, p.ate, p.mensalidade, p.implantacao]),
      [
        ['essencial', 10, 29700, 0],
        ['gestao', 30, 59700, 0],
        ['estrategico', 60, 99700, 0],
      ]
    );
    const totais = planos.map((p) => plano(ler(`valoresDoPlano(PLANOS.find(p => p.chave === '${p.chave}'))`)).total);
    assert.deepEqual(
      totais,
      [29700, 59700, 99700],
      'o primeiro pagamento é só a mensalidade: o link cobra exatamente isso'
    );
    const lista = plano(ler('listaDePlanos()'));
    assert.deepEqual(
      lista.map((p) => p.total),
      ['R$ 297,00', 'R$ 597,00', 'R$ 997,00']
    );
    assert.deepEqual(
      lista.map((p) => p.implantacao),
      ['Combinada pelo WhatsApp', 'Combinada pelo WhatsApp', 'Combinada pelo WhatsApp']
    );
  }
);
test(
  'o plano de cada quantidade de colaboradores: as bordas 10/11, 30/31 e 60/61; acima de 60 e valores inválidos não têm plano de tabela',
  opcoes,
  () => {
    const { ler } = logica();
    const p = (n) => ler(`(planoParaColaboradores(${n}) || {}).chave || null`);
    assert.deepEqual([1, 10, 11, 30, 31, 60].map(p), [
      'essencial',
      'essencial',
      'gestao',
      'gestao',
      'estrategico',
      'estrategico',
    ]);
    for (const n of [61, 500, 0, -3, 'NaN', 'Infinity']) assert.equal(p(n), null, String(n));
  }
);

test(
  'datas: o dia em Brasília, dd/mm/aaaa, diferença em dias e "um mês depois" (inclusive fim de mês e virada de ano)',
  opcoes,
  () => {
    const { ler } = logica();
    assert.equal(
      ler("dataBrasilDe('2026-11-17T02:00:00Z')"),
      '2026-11-16',
      '02h UTC ainda é o dia anterior em Brasília'
    );
    assert.equal(ler("dataBrasilDe('2026-11-17T12:00:00Z')"), '2026-11-17');
    assert.equal(ler("dataBrasilDe('lixo')"), null);
    assert.equal(ler("formatarDataBR('2026-11-07')"), '07/11/2026');
    assert.equal(ler("diasEntre('2026-11-10', '2026-11-17')"), 7);
    assert.equal(ler("diasEntre('2026-11-10', '2026-11-10')"), 0);
    assert.equal(ler("diasEntre('2026-11-10', '2026-11-08')"), -2);
    assert.equal(ler("diasEntre('2026-12-30', '2027-01-02')"), 3);
    const mais = (d) => ler(`somarUmMes('${d}')`);
    assert.equal(mais('2026-11-10'), '2026-12-10');
    assert.equal(mais('2026-12-15'), '2027-01-15');
    assert.equal(mais('2026-01-31'), '2026-02-28');
    assert.equal(mais('2028-01-31'), '2028-02-29', 'ano bissexto');
    assert.equal(mais('2026-11-30'), '2026-12-30');
  }
);

test(
  'o texto do aceite: plano, mensalidade, sem fidelidade, implantação combinada por WhatsApp (fora do pagamento), data e que NADA é cobrado automaticamente',
  opcoes,
  () => {
    const { ler } = logica();
    const t = ler("textoDoAceite(PLANOS[0], '2026-11-17')");
    for (const trecho of [
      'Plano Essencial (até 10 colaboradores)',
      'mensalidade de R$ 297,00',
      'sem fidelidade',
      'A taxa de implantação é combinada separadamente com você, pelo WhatsApp, e não faz parte deste pagamento',
      '17/11/2026',
      'pagar R$ 297,00 (a primeira mensalidade) pelo cartão',
      'Nada é cobrado automaticamente',
      'o acesso é pausado e seus dados ficam guardados',
      'cancelar quando quiser',
    ])
      assert.ok(t.includes(trecho), trecho);
    assert.ok(
      !t.includes('R$ 590') && !/débito automático|cobrança automática no|renova/i.test(t),
      'o texto não pode prometer o que não existe nem citar uma implantação que não é cobrada aqui'
    );
    assert.equal(ler('VERSAO_ACEITE'), 'v2');
  }
);

test(
  'o texto do aceite COM implantação no pagamento (o código ainda suporta): valor da implantação e total somado',
  opcoes,
  () => {
    const { ler } = logica();
    const t = ler(
      "textoDoAceite({ nome: 'Essencial', detalhe: 'Até 10 colaboradores', mensalidade: 29700, implantacao: 59000 }, '2026-11-17')"
    );
    for (const trecho of [
      'mensalidade de R$ 297,00, sem fidelidade e implantação de R$ 590,00 (cobrada uma única vez).',
      'pagar R$ 887,00 (implantação e primeira mensalidade) pelo cartão',
    ])
      assert.ok(t.includes(trecho), trecho);
    assert.ok(!t.includes('WhatsApp'));
  }
);
test(
  'quem pode trocar de plano, cancelar e ter o pagamento confirmado, por situação (ativa só dentro da janela do vencimento)',
  opcoes,
  () => {
    const { ler } = logica();
    const sts = ['agendada', 'aguardando_pagamento', 'ativa', 'em_atraso', 'suspensa', 'cancelada'];
    assert.deepEqual(
      sts.map((s) => ler(`podeEscolherPlano('${s}')`)),
      [true, true, false, false, false, true]
    );
    assert.deepEqual(
      sts.map((s) => ler(`podeCancelar('${s}')`)),
      [true, true, true, true, true, false]
    );
    const confirma = (s, ciclo) => ler(`podeConfirmarPagamento('${s}', '${ciclo}', '2026-11-10')`);
    assert.deepEqual(
      sts.map((s) => confirma(s, '2026-12-10')),
      [true, true, false, true, true, false],
      'ativa com o vencimento longe: não'
    );
    assert.equal(confirma('ativa', '2026-11-13'), true, 'ativa a 3 dias do vencimento: pagou adiantado');
    assert.equal(confirma('ativa', '2026-11-14'), false, 'ativa a 4 dias: cedo demais');
    assert.equal(confirma('ativa', '2026-11-10'), true);
    assert.equal(ler('podeEscolherPlano(null)'), true, 'quem ainda não escolheu plano pode escolher');
  }
);
test(
  'a situação conforme a data: antes do fim do teste agendada; no dia e depois, aguardando pagamento',
  opcoes,
  () => {
    const { ler } = logica();
    assert.equal(ler("statusParaData('2026-11-17', '2026-11-16')"), 'agendada');
    assert.equal(ler("statusParaData('2026-11-17', '2026-11-17')"), 'aguardando_pagamento');
    assert.equal(ler("statusParaData('2026-11-17', '2026-11-20')"), 'aguardando_pagamento');
  }
);

test(
  'o link de pagamento só aparece a partir de 3 dias antes do vencimento (nunca logo depois de pagar), e depois dele',
  opcoes,
  () => {
    const { ler } = logica();
    const j = (status, data) => ler(`janelaDoLink('${status}', '${data}', '2026-11-10')`);
    for (const s of ['agendada', 'ativa']) {
      assert.equal(j(s, '2026-11-17'), false, `${s}: 7 dias antes`);
      assert.equal(j(s, '2026-11-14'), false, `${s}: 4 dias antes`);
      assert.equal(j(s, '2026-11-13'), true, `${s}: 3 dias antes`);
      assert.equal(j(s, '2026-11-10'), true, `${s}: no dia`);
    }
    assert.equal(j('ativa', '2026-12-10'), false, 'acabou de pagar: o vencimento está a um mês');
    for (const s of ['aguardando_pagamento', 'em_atraso', 'suspensa']) assert.equal(j(s, '2026-11-17'), true, s);
    assert.equal(j('cancelada', '2026-11-10'), false);
  }
);

test(
  'o ciclo mensal: a data do ciclo, o link certo, o próximo vencimento (no prazo, adiantado, atrasado) e somar dias',
  opcoes,
  () => {
    const { ler } = logica();
    assert.equal(ler("somarDias('2026-11-10', 7)"), '2026-11-17');
    assert.equal(ler("somarDias('2026-12-28', 7)"), '2027-01-04');
    const nunca = { primeira_cobranca_em: '2026-11-17', ultima_cobranca_em: null, proxima_cobranca_em: null };
    const pagou = {
      primeira_cobranca_em: '2026-11-17',
      ultima_cobranca_em: '2026-10-10',
      proxima_cobranca_em: '2026-11-10',
    };
    assert.deepEqual(
      [ler(`dataDoCiclo(${JSON.stringify(nunca)})`), ler(`dataDoCiclo(${JSON.stringify(pagou)})`)],
      ['2026-11-17', '2026-11-10']
    );
    assert.deepEqual(
      [ler(`tipoDoLink(${JSON.stringify(nunca)})`), ler(`tipoDoLink(${JSON.stringify(pagou)})`)],
      ['primeira', 'mensalidade']
    );
    const prox = (a, hoje) => ler(`proximoVencimento(${JSON.stringify(a)}, '${hoje}')`);
    assert.equal(prox(nunca, '2026-11-17'), '2026-12-17', 'primeiro pagamento: um mês a partir de hoje');
    assert.equal(prox(pagou, '2026-11-10'), '2026-12-10', 'pagou no vencimento: o dia do mês não anda');
    assert.equal(prox(pagou, '2026-11-08'), '2026-12-10', 'pagou adiantado: continua no dia 10');
    assert.equal(prox(pagou, '2026-11-25'), '2026-12-10', 'atrasou 15 dias: ainda cai no dia 10 do mês seguinte');
    assert.equal(
      prox(pagou, '2027-02-03'),
      '2027-03-03',
      'atrasou meses: um mês a partir de hoje, não uma fila de vencimentos antigos'
    );
    assert.equal(prox({ ...pagou, proxima_cobranca_em: '2026-01-31' }, '2026-01-31'), '2026-02-28', 'fim de mês');
  }
);

test(
  'o resumo da mensalidade: ciclo, o valor da mensalidade, o vencimento e a data em que o acesso é suspenso (7 dias depois)',
  opcoes,
  () => {
    const { ler } = logica();
    const linha = {
      plano: 'gestao',
      status: 'ativa',
      mensalidade_centavos: 59700,
      implantacao_centavos: 99000,
      primeira_cobranca_centavos: 158700,
      primeira_cobranca_em: '2026-10-10',
      ultima_cobranca_em: '2026-10-10',
      proxima_cobranca_em: '2026-11-12',
      aceite_em: 'x',
      aceite_texto: 'y',
    };
    const r = plano(ler(`montarResumo(${JSON.stringify(linha)}, 'https://p.com/mensal', '2026-11-10')`));
    assert.deepEqual(
      [r.ciclo, r.total, r.cicloEm, r.cicloEmBR, r.suspensaoEmBR, r.diasParaCobranca, r.link],
      ['mensalidade', 'R$ 597,00', '2026-11-12', '12/11/2026', '19/11/2026', 2, 'https://p.com/mensal']
    );
    const longe = plano(
      ler(
        `montarResumo(${JSON.stringify({ ...linha, proxima_cobranca_em: '2026-12-10' })}, 'https://p.com/mensal', '2026-11-10')`
      )
    );
    assert.deepEqual([longe.link, longe.linkIndisponivel], [null, false], 'ainda longe do vencimento: sem link');
    const primeiro = plano(
      ler(
        `montarResumo(${JSON.stringify({ ...linha, status: 'agendada', ultima_cobranca_em: null, proxima_cobranca_em: null, primeira_cobranca_em: '2026-11-17' })}, null, '2026-11-10')`
      )
    );
    assert.deepEqual([primeiro.ciclo, primeiro.total, primeiro.cicloEmBR], ['primeira', 'R$ 1.587,00', '17/11/2026']);
  }
);
test(
  'o resumo mostra o link só dentro da janela, avisa quando o link do plano não foi cadastrado e formata os valores',
  opcoes,
  () => {
    const { ler } = logica();
    const linha = {
      plano: 'gestao',
      status: 'agendada',
      mensalidade_centavos: 59700,
      implantacao_centavos: 99000,
      primeira_cobranca_centavos: 158700,
      primeira_cobranca_em: '2026-11-17',
      aceite_em: 'x',
      aceite_texto: 'y',
    };
    const r = (l, link, hoje) => plano(ler(`montarResumo(${JSON.stringify(l)}, ${JSON.stringify(link)}, '${hoje}')`));
    const fora = r(linha, 'https://p.com/x', '2026-11-10');
    assert.deepEqual(
      [
        fora.link,
        fora.linkIndisponivel,
        fora.total,
        fora.mensalidade,
        fora.implantacao,
        fora.diasParaCobranca,
        fora.primeiraCobrancaEmBR,
      ],
      [null, false, 'R$ 1.587,00', 'R$ 597,00', 'R$ 990,00', 7, '17/11/2026']
    );
    const dentro = r(linha, 'https://p.com/x', '2026-11-15');
    assert.deepEqual([dentro.link, dentro.linkIndisponivel], ['https://p.com/x', false]);
    const semLink = r(linha, null, '2026-11-15');
    assert.deepEqual([semLink.link, semLink.linkIndisponivel], [null, true]);
    assert.ok(semLink.whatsapp.includes('wa.me/558999857062'));
    assert.deepEqual([fora.plano.nome, fora.podeTrocarPlano, fora.podeCancelar], ['Gestão', true, true]);
  }
);

// ======================= a função inteira =======================
test(
  'com a cobrança DESLIGADA: o resumo diz isso (e o site esconde tudo) e as outras ações recusam, sem nem olhar a sessão',
  opcoes,
  async () => {
    const f = montarFuncao({ ativa: false });
    const r = await f.chamar({ action: 'resumo' }, null);
    assert.deepEqual([r.status, r.json], [200, { ativa: false }]);
    for (const acao of ['escolher_plano', 'cancelar', 'confirmar_pagamento']) {
      const x = await f.chamar({ action: acao, plano: 'essencial' }, ID.ownerA);
      assert.equal(x.status, 403, acao);
    }
    assert.equal(f.banco.t.assinaturas.length, 0);
  }
);

test('sem sessão válida: 401; corpo ilegível: 400; ação desconhecida: 400', opcoes, async () => {
  const f = montarFuncao();
  assert.equal((await f.chamar({ action: 'resumo' }, null)).status, 401);
  assert.equal((await f.chamar({ action: 'resumo' }, 'token-que-nao-existe')).status, 401);
  assert.equal((await f.chamar(new Error('json quebrado'), ID.ownerA)).status, 400);
  const x = await f.chamar({ action: 'apagar_tudo' }, ID.ownerA);
  assert.deepEqual([x.status, /Ação desconhecida/.test(x.json.error)], [400, true]);
});

test(
  'só o Administrador da empresa mexe na cobrança: RH, Administrador desativado e visitante são recusados',
  opcoes,
  async () => {
    const f = montarFuncao();
    for (const quem of [ID.rhA, ID.desativadoA]) {
      for (const acao of ['resumo', 'escolher_plano', 'cancelar'])
        assert.equal((await f.chamar({ action: acao, plano: 'essencial' }, quem)).status, 403, `${quem} ${acao}`);
    }
    assert.equal(f.banco.t.assinaturas.length, 0);
  }
);

test(
  'resumo sem assinatura: lista os três planos e o fim do teste em Brasília, sem expor nenhum link',
  opcoes,
  async () => {
    const f = montarFuncao();
    const r = await f.chamar({ action: 'resumo' }, ID.ownerA);
    assert.equal(r.status, 200);
    assert.deepEqual(
      [r.json.ativa, r.json.assinatura, r.json.trialAte, r.json.ehPagante],
      [true, null, '2026-11-17', false]
    );
    assert.deepEqual(
      r.json.planos.map((p) => p.chave),
      ['essencial', 'gestao', 'estrategico']
    );
    assert.ok(!r.texto.includes('pague.exemplo.com'), 'nenhum link no resumo antes de existir assinatura');
  }
);

test(
  'escolher o plano: grava valores e data certos, o aceite (texto gerado no servidor) e o evento; o link ainda não aparece (faltam 7 dias)',
  opcoes,
  async () => {
    const f = montarFuncao();
    const r = await f.chamar(
      {
        action: 'escolher_plano',
        plano: 'essencial',
        aceite_texto: 'TEXTO FALSO VINDO DO NAVEGADOR',
        status: 'ativa',
        primeira_cobranca_centavos: 1,
      },
      ID.ownerA
    );
    assert.equal(r.status, 200);
    const [a] = f.banco.t.assinaturas;
    assert.deepEqual(
      [
        a.empresa_id,
        a.plano,
        a.mensalidade_centavos,
        a.implantacao_centavos,
        a.primeira_cobranca_centavos,
        a.primeira_cobranca_em,
        a.status,
        a.aceite_por,
        a.aceite_versao,
      ],
      [ID.empresaA, 'essencial', 29700, 0, 29700, '2026-11-17', 'agendada', ID.ownerA, 'v2']
    );
    assert.ok(
      a.aceite_texto.startsWith('Plano Essencial') && !a.aceite_texto.includes('FALSO'),
      'o texto do aceite vem do servidor'
    );
    assert.ok(a.aceite_texto.includes('pelo WhatsApp'));
    assert.equal(r.json.resumo.implantacao, 'Combinada pelo WhatsApp');
    assert.deepEqual([r.json.resumo.link, r.json.resumo.total, r.json.resumo.diasParaCobranca], [null, 'R$ 297,00', 7]);
    assert.deepEqual(
      f.banco.t.assinaturas_eventos.map((e) => [e.empresa_id, e.tipo]),
      [[ID.empresaA, 'plano_escolhido']]
    );
  }
);

test(
  'escolher plano: plano inventado (400), empresa fora de teste (400), empresa que já é cliente (409) e assinatura já ativa (409)',
  opcoes,
  async () => {
    const f = montarFuncao();
    assert.equal((await f.chamar({ action: 'escolher_plano', plano: 'premium' }, ID.ownerA)).status, 400);
    assert.equal((await f.chamar({ action: 'escolher_plano' }, ID.ownerA)).status, 400);
    f.banco.t.empresas[0].trial_ate = null;
    assert.equal((await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA)).status, 400);
    f.banco.t.empresas[0].trial_ate = iso(7);
    f.banco.t.empresas[0].is_pagante = true;
    assert.equal((await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA)).status, 409);
    f.banco.t.empresas[0].is_pagante = false;
    f.banco.t.assinaturas.push({ empresa_id: ID.empresaA, status: 'ativa' });
    const ativa = await f.chamar({ action: 'escolher_plano', plano: 'gestao' }, ID.ownerA);
    assert.deepEqual([ativa.status, f.banco.t.assinaturas[0].status], [409, 'ativa']);
  }
);

test(
  'trocar de plano antes de pagar: continua uma só assinatura, com o aceite novo, e cada escolha fica no histórico',
  opcoes,
  async () => {
    const f = montarFuncao();
    await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
    f.avancar(60000); // um minuto depois
    const r = await f.chamar({ action: 'escolher_plano', plano: 'estrategico' }, ID.ownerA);
    assert.equal(r.status, 200);
    assert.equal(f.banco.t.assinaturas.length, 1);
    const [a] = f.banco.t.assinaturas;
    assert.deepEqual(
      [a.plano, a.primeira_cobranca_centavos, a.mensalidade_centavos, a.implantacao_centavos],
      ['estrategico', 99700, 99700, 0]
    );
    assert.ok(a.aceite_texto.startsWith('Plano Estratégico (31 a 60 colaboradores)'));
    assert.equal(f.banco.t.assinaturas_eventos.length, 2);
  }
);

test(
  'teste que já terminou: a cobrança é de hoje e a assinatura já aguarda o pagamento, com o link do plano',
  opcoes,
  async () => {
    const f = montarFuncao();
    f.banco.t.empresas[0].trial_ate = iso(-2);
    const r = await f.chamar({ action: 'escolher_plano', plano: 'gestao' }, ID.ownerA);
    assert.equal(r.status, 200);
    assert.deepEqual(
      [f.banco.t.assinaturas[0].status, f.banco.t.assinaturas[0].primeira_cobranca_em],
      ['aguardando_pagamento', '2026-11-10']
    );
    assert.equal(r.json.resumo.link, 'https://pague.exemplo.com/gestao-1587');
  }
);

test(
  'o link do plano aparece perto do fim do teste, é SÓ o do plano da própria empresa, e as outras empresas nunca o recebem',
  opcoes,
  async () => {
    const f = montarFuncao();
    await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
    await f.chamar({ action: 'escolher_plano', plano: 'estrategico' }, ID.ownerB);
    // faltam 3 dias para a empresa A; a B continua com 7
    f.banco.t.assinaturas.find((a) => a.empresa_id === ID.empresaA).primeira_cobranca_em = '2026-11-13';
    const a = await f.chamar({ action: 'resumo' }, ID.ownerA);
    const b = await f.chamar({ action: 'resumo' }, ID.ownerB);
    assert.equal(a.json.assinatura.link, 'https://pague.exemplo.com/essencial-887');
    assert.equal(b.json.assinatura.link, null, 'a empresa B ainda está fora da janela');
    assert.ok(
      !a.texto.includes('gestao-1587') && !a.texto.includes('estrategico-2487'),
      'o link de outros planos nunca vai junto'
    );
    f.banco.acessos.length = 0;
    await f.chamar({ action: 'resumo' }, ID.ownerA);
    const lidosDeLinks = f.banco.acessos.filter(([t]) => t === 'links_pagamento').map(([, c, v]) => `${c}=${v}`);
    assert.deepEqual(
      lidosDeLinks,
      ['plano=essencial', 'tipo=primeira'],
      'a função só consulta o link do plano da empresa'
    );
  }
);

test('sem link cadastrado para o plano: o resumo avisa (linkIndisponivel) em vez de quebrar', opcoes, async () => {
  const f = montarFuncao();
  f.banco.t.links_pagamento = [];
  await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
  f.banco.t.assinaturas[0].primeira_cobranca_em = '2026-11-12';
  const r = await f.chamar({ action: 'resumo' }, ID.ownerA);
  assert.deepEqual([r.json.assinatura.link, r.json.assinatura.linkIndisponivel], [null, true]);
});

test(
  'cancelar: marca cancelada com quem e quando, guarda o motivo (limitado), registra o evento uma só vez, e quem cancelou pode escolher o plano de novo',
  opcoes,
  async () => {
    const f = montarFuncao();
    await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
    const r = await f.chamar({ action: 'cancelar', motivo: `${'x'.repeat(500)}` }, ID.ownerA);
    assert.equal(r.status, 200);
    const [a] = f.banco.t.assinaturas;
    assert.deepEqual(
      [a.status, a.cancelada_por, !!a.cancelada_em, a.motivo_cancelamento.length],
      ['cancelada', ID.ownerA, true, 300]
    );
    assert.equal(r.json.resumo.podeCancelar, false);
    const canceladaEm = f.banco.t.assinaturas[0].cancelada_em;
    f.avancar(3600000); // uma hora depois
    await f.chamar({ action: 'cancelar' }, ID.ownerA); // de novo: não duplica e não mexe na data do primeiro cancelamento
    assert.equal(
      f.banco.t.assinaturas[0].cancelada_em,
      canceladaEm,
      'o segundo cancelamento não pode trocar a data do primeiro'
    );
    assert.equal(f.banco.t.assinaturas_eventos.filter((e) => e.tipo === 'cancelada').length, 1);
    f.avancar(3600000);
    const volta = await f.chamar({ action: 'escolher_plano', plano: 'gestao' }, ID.ownerA);
    assert.equal(volta.status, 200);
    assert.deepEqual(
      [f.banco.t.assinaturas[0].status, f.banco.t.assinaturas[0].cancelada_em, f.banco.t.assinaturas[0].cancelada_por],
      ['agendada', null, null]
    );
    assert.equal(
      (await f.chamar({ action: 'cancelar' }, ID.ownerB)).status,
      404,
      'quem não tem assinatura não cancela a dos outros'
    );
  }
);

test(
  'confirmar pagamento (primeiro): só o Super Admin; ativa a assinatura e marca a empresa como cliente; confirmar duas vezes não vale; suspensão feita à mão não é desfeita',
  opcoes,
  async () => {
    const f = montarFuncao();
    await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
    f.banco.t.empresas[0].acesso_suspenso = true; // suspensa à mão pelo Super Admin por outro motivo
    for (const quem of [ID.ownerA, ID.rhA, ID.ownerB])
      assert.equal(
        (await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, quem)).status,
        403,
        `${quem} não confirma pagamento`
      );
    assert.equal(f.banco.t.assinaturas[0].status, 'agendada');
    assert.equal(
      (await f.chamar({ action: 'confirmar_pagamento', empresa_id: "x'; drop table empresas;--" }, ID.superAdmin))
        .status,
      400
    );
    assert.equal(
      (await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaB }, ID.superAdmin)).status,
      404,
      'empresa sem assinatura'
    );
    const ok = await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin);
    assert.equal(ok.status, 200);
    const [a] = f.banco.t.assinaturas;
    assert.deepEqual(
      [a.status, a.pago_confirmado_por, a.ultima_cobranca_em, a.proxima_cobranca_em, !!a.pago_em],
      ['ativa', ID.superAdmin, '2026-11-10', '2026-12-10', true]
    );
    assert.equal(f.banco.t.empresas[0].is_pagante, true);
    assert.equal(
      f.banco.t.empresas[0].acesso_suspenso,
      true,
      'a suspensão manual por outro motivo não é desfeita pela cobrança'
    );
    assert.equal(f.banco.t.empresas[1].is_pagante, false, 'a outra empresa não é afetada');
    assert.ok(f.banco.t.assinaturas_eventos.some((x) => x.tipo === 'pagamento_confirmado'));
    assert.equal(
      (await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin)).status,
      409,
      'recém paga: o vencimento está a um mês'
    );
  }
);

const PAGA = (extra = {}) => ({
  empresa_id: ID.empresaA,
  plano: 'essencial',
  status: 'ativa',
  mensalidade_centavos: 29700,
  implantacao_centavos: 0,
  primeira_cobranca_centavos: 29700,
  primeira_cobranca_em: '2026-10-10',
  ultima_cobranca_em: '2026-10-10',
  proxima_cobranca_em: '2026-11-10',
  aceite_em: 'x',
  aceite_texto: 'y',
  ...extra,
});
test(
  'confirmar a MENSALIDADE: o vencimento anda um mês e o dia não muda (no prazo, adiantado ou atrasado)',
  opcoes,
  async () => {
    for (const [status, proxima, esperado] of [
      ['aguardando_pagamento', '2026-11-10', '2026-12-10'],
      ['em_atraso', '2026-11-04', '2026-12-04'],
      ['ativa', '2026-11-12', '2026-12-12'],
      ['em_atraso', '2026-08-10', '2026-12-10'],
    ]) {
      const f = montarFuncao();
      f.banco.t.assinaturas.push(PAGA({ status, proxima_cobranca_em: proxima }));
      const r = await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin);
      assert.equal(r.status, 200, `${status} ${proxima}`);
      const [a] = f.banco.t.assinaturas;
      assert.deepEqual(
        [a.status, a.ultima_cobranca_em, a.proxima_cobranca_em],
        ['ativa', '2026-11-10', esperado],
        `${status} ${proxima}`
      );
    }
    const f = montarFuncao();
    f.banco.t.assinaturas.push(PAGA({ status: 'ativa', proxima_cobranca_em: '2026-12-10' }));
    assert.equal(
      (await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin)).status,
      409,
      'ativa e longe do vencimento: não confirma'
    );
  }
);

test('assinatura SUSPENSA pela cobrança: confirmar o pagamento devolve o acesso', opcoes, async () => {
  const f = montarFuncao();
  f.banco.t.assinaturas.push(PAGA({ status: 'suspensa', proxima_cobranca_em: '2026-11-01' }));
  f.banco.t.empresas[0].is_pagante = true;
  f.banco.t.empresas[0].acesso_suspenso = true;
  const r = await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin);
  assert.equal(r.status, 200);
  assert.deepEqual(
    [
      f.banco.t.empresas[0].is_pagante,
      f.banco.t.empresas[0].acesso_suspenso,
      f.banco.t.assinaturas[0].status,
      f.banco.t.assinaturas[0].proxima_cobranca_em,
    ],
    [true, false, 'ativa', '2026-12-01']
  );
});

test(
  'o resumo da mensalidade usa o link de MENSALIDADE (não o do primeiro pagamento) e só perto do vencimento',
  opcoes,
  async () => {
    const f = montarFuncao();
    f.banco.t.assinaturas.push(PAGA({ proxima_cobranca_em: '2026-11-12' }));
    const r = await f.chamar({ action: 'resumo' }, ID.ownerA);
    assert.equal(r.json.assinatura.link, 'https://pague.exemplo.com/essencial-mensal');
    assert.deepEqual(
      [r.json.assinatura.ciclo, r.json.assinatura.total, r.json.assinatura.cicloEmBR, r.json.assinatura.suspensaoEmBR],
      ['mensalidade', 'R$ 297,00', '12/11/2026', '19/11/2026']
    );
    assert.ok(!r.texto.includes('essencial-887'));
    f.banco.t.assinaturas[0].proxima_cobranca_em = '2026-12-10';
    assert.equal((await f.chamar({ action: 'resumo' }, ID.ownerA)).json.assinatura.link, null);
  }
);

test('cancelar uma assinatura paga mantém o vencimento (é até quando o acesso vale)', opcoes, async () => {
  const f = montarFuncao();
  f.banco.t.assinaturas.push(PAGA({ proxima_cobranca_em: '2026-11-28' }));
  f.banco.t.empresas[0].is_pagante = true;
  const r = await f.chamar({ action: 'cancelar' }, ID.ownerA);
  assert.equal(r.status, 200);
  assert.deepEqual(
    [f.banco.t.assinaturas[0].status, f.banco.t.assinaturas[0].proxima_cobranca_em],
    ['cancelada', '2026-11-28']
  );
});
test('assinatura cancelada não pode ter o pagamento confirmado por engano', opcoes, async () => {
  const f = montarFuncao();
  await f.chamar({ action: 'escolher_plano', plano: 'essencial' }, ID.ownerA);
  await f.chamar({ action: 'cancelar' }, ID.ownerA);
  const r = await f.chamar({ action: 'confirmar_pagamento', empresa_id: ID.empresaA }, ID.superAdmin);
  assert.deepEqual([r.status, f.banco.t.empresas[0].is_pagante], [409, false]);
});

test(
  'leitura do código: a função nunca usa o texto do aceite nem os valores vindos do navegador, e só lê o link pelo plano e tipo',
  opcoes,
  () => {
    assert.ok(
      !/body\??\.aceite|body\??\.status|body\??\.valor|body\??\.total|body\??\.mensalidade/.test(origem),
      'valores e aceite não podem vir do navegador'
    );
    assert.ok(/from\('links_pagamento'\)\.select\('url'\)\.eq\('plano', plano\)\.eq\('tipo', tipo\)/.test(origem));
    assert.ok(
      !/select\('\*'\)[^;]*links_pagamento|links_pagamento'\)\.select\('\*'/.test(origem),
      'nunca lê todos os links'
    );
    assert.ok(!origem.includes('Math.random'));
    assert.ok(origem.includes("Deno.env.get('COBRANCA_ATIVA') !== 'true'"));
  }
);
