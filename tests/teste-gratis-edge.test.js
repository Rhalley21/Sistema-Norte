// =========================================================================
// Teste grátis, lado do SERVIDOR (supabase/functions/teste-gratis). Roda o CÓDIGO REAL da função, com tipos removidos, contra
// um banco falso em memória: limites só para pedidos válidos, reaproveitamento do código, falha do e-mail, aviso à equipe,
// escape de HTML. O que a função faz com a rede (reCAPTCHA, enviar-email) é simulado, e cada chamada fica registrada.
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
const origem = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'teste-gratis', 'index.ts'), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const FORMATO_CODIGO = /^NORTE-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// ---------- a lógica pura ----------
function logica() {
  const ini = origem.indexOf('function escaparHtml');
  const fim = origem.indexOf('// ---- fim: lógica do teste');
  assert.ok(ini >= 0 && fim > ini, 'não achei a lógica do teste');
  const ctx = vm.createContext({ console, String, Array, Object, JSON, Set, Date, Math, Number, encodeURIComponent });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}

// ---------- a função inteira, com banco e rede de mentira ----------
function bancoFalso() {
  const tabelas = { rate_limit_log: [], solicitacoes_teste: [], codigos_licenca_empresa: [] };
  function consulta(nome) {
    const q = { filtros: [], ordem: null, limite: null, opts: null };
    const api = {
      select(cols, opts) {
        q.opts = opts || null;
        return api;
      },
      eq(c, v) {
        q.filtros.push((r) => r[c] === v);
        return api;
      },
      gte(c, v) {
        q.filtros.push((r) => String(r[c]) >= v);
        return api;
      },
      in(c, vs) {
        q.filtros.push((r) => vs.includes(r[c]));
        return api;
      },
      order(c, { ascending }) {
        q.ordem = [c, ascending];
        return api;
      },
      limit(n) {
        q.limite = n;
        return api;
      },
      insert(linha) {
        const padrao = nome === 'codigos_licenca_empresa' ? { usado: false } : {};
        tabelas[nome].push({ criado_em: new Date().toISOString(), ...padrao, ...linha });
        return Promise.resolve({ error: null });
      },
      then(resolve) {
        let linhas = tabelas[nome].filter((r) => q.filtros.every((f) => f(r)));
        if (q.ordem)
          linhas = linhas.sort(
            (a, b) => (String(a[q.ordem[0]]) < String(b[q.ordem[0]]) ? 1 : -1) * (q.ordem[1] ? -1 : 1)
          );
        if (q.limite) linhas = linhas.slice(0, q.limite);
        if (q.opts && q.opts.count) resolve({ count: linhas.length, data: q.opts.head ? null : linhas, error: null });
        else resolve({ data: linhas, error: null });
      },
    };
    return api;
  }
  return { from: consulta, tabelas };
}

function montarFuncao({ env = {}, recaptcha = true, emailSai = (para) => true, banco = bancoFalso() } = {}) {
  const chamadas = { recaptcha: 0, emails: [] };
  let handler;
  const ambiente = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'CHAVE-DE-SERVICO',
    RECAPTCHA_SECRET_KEY: 'segredo',
    ...env,
  };
  const fetchFalso = async (url, init) => {
    if (String(url).includes('recaptcha/api/siteverify')) {
      chamadas.recaptcha++;
      return { json: async () => ({ success: typeof recaptcha === 'function' ? recaptcha() : recaptcha }) };
    }
    if (String(url).includes('/functions/v1/enviar-email')) {
      const corpo = JSON.parse(init.body);
      chamadas.emails.push({ ...corpo, autorizacao: init.headers.Authorization });
      const ok = emailSai(corpo.destinatario);
      return { ok, status: ok ? 200 : 500, text: async () => 'erro simulado' };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
  const silencioso = { log() {}, warn() {}, error() {} };
  const ctx = vm.createContext({
    console: silencioso,
    String,
    Array,
    Object,
    JSON,
    Set,
    Date,
    Math,
    Number,
    Promise,
    encodeURIComponent,
    Uint8Array,
    crypto,
    Response,
    setTimeout,
    serve: (h) => {
      handler = h;
    },
    createClient: () => banco,
    Deno: { env: { get: (k) => ambiente[k] } },
    fetch: fetchFalso,
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.replace(/^import .*$/gm, '')), ctx);
  assert.equal(typeof handler, 'function', 'a função não registrou o serve');
  async function chamar(corpo, { ip = '203.0.113.10', metodo = 'POST' } = {}) {
    const req = {
      method: metodo,
      headers: { get: (k) => ({ 'x-forwarded-for': ip })[k.toLowerCase()] || null },
      json: async () => (corpo instanceof Error ? Promise.reject(corpo) : corpo),
    };
    const resp = await handler(req);
    await new Promise((r) => setImmediate(r)); // o aviso à equipe não é esperado pela resposta: deixa terminar
    const texto = await resp.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch (_) {}
    return { status: resp.status, json, texto };
  }
  return { chamar, chamadas, banco };
}
const PEDIDO = {
  nome: 'Ana Souza',
  email: 'ana@empresa.com',
  empresa: 'Loja Aurora',
  telefone: '(89) 99999-1234',
  recaptchaToken: 'tok',
};
const contagem = (banco, acao) => banco.tabelas.rate_limit_log.filter((r) => r.acao === acao).length;

// ======================= a lógica pura =======================
test('e-mail normalizado: sem espaços e em minúsculas', { ...opcoes }, () => {
  const c = logica();
  assert.equal(c.normalizarEmail('  ANA@Empresa.COM '), 'ana@empresa.com');
  assert.equal(c.normalizarEmail(null), '');
});

test('endereço do site: sempre com a barra no fim; sem o segredo usa o endereço padrão', opcoes, () => {
  const c = logica();
  assert.equal(c.baseDoSite('https://sistema.inetris.com.br'), 'https://sistema.inetris.com.br/');
  assert.equal(c.baseDoSite('https://sistema.inetris.com.br/'), 'https://sistema.inetris.com.br/');
  assert.equal(c.baseDoSite(undefined), 'https://rhalley21.github.io/Sistema-Norte/');
  assert.equal(c.baseDoSite('  '), 'https://rhalley21.github.io/Sistema-Norte/');
});

test('o botão do e-mail leva SÓ o código no endereço (depois do #), nunca nome, e-mail ou empresa', opcoes, () => {
  const c = logica();
  const url = c.linkDeCadastro('https://sistema.inetris.com.br/', 'NORTE-ABCD-EF23');
  assert.equal(url, 'https://sistema.inetris.com.br/app.html#cadastro&codigo=NORTE-ABCD-EF23');
  assert.ok(!/@|nome=|email=|empresa=/.test(url));
});

test(
  'reaproveitar: o código mais recente que ainda não foi usado e tem menos de 24 h; usado, antigo ou vazio não vale',
  opcoes,
  () => {
    const c = logica();
    const agora = Date.parse('2026-11-10T12:00:00Z');
    const h = (horasAtras) => new Date(agora - horasAtras * 3600000).toISOString();
    const r = (pedidos, livres) => c.codigoReaproveitavel(plano(pedidos), plano(livres), agora);
    assert.equal(r([{ codigo_gerado: 'A', criado_em: h(2) }], ['A']), 'A');
    assert.equal(
      r(
        [
          { codigo_gerado: 'A', criado_em: h(5) },
          { codigo_gerado: 'B', criado_em: h(1) },
        ],
        ['A', 'B']
      ),
      'B',
      'o mais recente'
    );
    assert.equal(r([{ codigo_gerado: 'A', criado_em: h(2) }], []), null, 'já foi usado');
    assert.equal(r([{ codigo_gerado: 'A', criado_em: h(25) }], ['A']), null, 'passou de 24 h');
    assert.equal(r([{ codigo_gerado: 'A', criado_em: h(24) }], ['A']), 'A', 'exatamente 24 h ainda vale');
    assert.equal(r([{ codigo_gerado: null, criado_em: h(1) }], ['A']), null);
    assert.equal(r([], ['A']), null);
    assert.equal(
      r(
        [
          { codigo_gerado: 'A', criado_em: h(2) },
          { codigo_gerado: 'B', criado_em: h(1) },
        ],
        ['A']
      ),
      'A',
      'pula o mais novo se ele já foi usado'
    );
  }
);

test(
  'os limites escolhidos: tentativas por hora, pedidos por IP (alto, por causa do IP compartilhado) e por e-mail (baixo)',
  opcoes,
  () => {
    assert.deepEqual(plano(vm.runInContext('LIMITES', logica())), {
      tentativasPorHora: 30,
      pedidosPorIpPorDia: 10,
      pedidosPorEmailPorDia: 2,
    });
  }
);

test(
  'e-mail do código: assunto, código, botão com o endereço, WhatsApp, e NÃO promete resposta por e-mail',
  opcoes,
  () => {
    const c = logica();
    const m = plano(
      c.montarEmailCodigo({
        nome: 'Ana',
        nomeEmpresa: 'Loja Aurora',
        codigo: 'NORTE-ABCD-EF23',
        urlCadastro: 'https://s.test/app.html#cadastro&codigo=NORTE-ABCD-EF23',
      })
    );
    assert.equal(m.assunto, 'Seu código do teste grátis do INETRIS');
    for (const t of [
      'Olá, Ana!',
      '<b>Loja Aurora</b>',
      'NORTE-ABCD-EF23',
      'Criar minha conta agora',
      'href="https://s.test/app.html#cadastro&amp;codigo=NORTE-ABCD-EF23"',
      'wa.me/558999857062',
      '7 dias a partir do cadastro',
      'Cadastrar',
    ])
      assert.ok(m.corpoHtml.includes(t), t);
    assert.ok(
      !/responda este e-mail/i.test(m.corpoHtml),
      'as respostas vão para um endereço sem caixa: não prometa isso'
    );
    assert.ok(!/\p{Extended_Pictographic}/u.test(m.assunto), 'sem emoji no assunto');
  }
);

test('e-mail do código: nome, empresa e até o endereço do botão saem escapados (sem injeção de HTML)', opcoes, () => {
  const c = logica();
  const ruim = '<img src=x onerror=alert(1)>';
  const m = plano(
    c.montarEmailCodigo({
      nome: ruim,
      nomeEmpresa: ruim,
      codigo: 'NORTE-ABCD-EF23',
      urlCadastro: 'https://s.test/"><script>1</script>',
    })
  );
  assert.ok(!m.corpoHtml.includes('<img src=x') && !m.corpoHtml.includes('<script>'));
  assert.ok(m.corpoHtml.includes('&lt;img src=x') && m.corpoHtml.includes('&quot;&gt;&lt;script&gt;'));
});

test(
  'aviso à equipe: quem pediu, o código e como falar; se o e-mail NÃO saiu, o assunto grita e o código vai junto',
  opcoes,
  () => {
    const c = logica();
    const base = {
      nome: 'Ana',
      email: 'ana@x.com',
      nomeEmpresa: 'Loja Aurora',
      telefone: '(89) 99999-1234',
      codigo: 'NORTE-ABCD-EF23',
    };
    const ok = plano(c.montarAvisoEquipe({ ...base, emailEnviado: true }));
    assert.equal(ok.assunto, 'Novo teste grátis: Loja Aurora');
    for (const t of ['Ana', 'ana@x.com', 'Loja Aurora', '(89) 99999-1234', 'NORTE-ABCD-EF23', 'próximas 24 horas'])
      assert.ok(ok.corpoHtml.includes(t), t);
    const falhou = plano(c.montarAvisoEquipe({ ...base, emailEnviado: false }));
    assert.ok(falhou.assunto.startsWith('ATENÇÃO') && falhou.assunto.includes('NÃO saiu'));
    assert.ok(falhou.corpoHtml.includes('NORTE-ABCD-EF23') && falhou.corpoHtml.includes('não saiu'));
    assert.ok(c.montarAvisoEquipe({ ...base, telefone: '', emailEnviado: true }).corpoHtml.includes('não informado'));
  }
);

test(
  'aviso à equipe: tudo que veio do formulário sai escapado e o assunto não leva quebra de linha nem passa de tamanho razoável',
  opcoes,
  () => {
    const c = logica();
    const ruim = '<b onmouseover=alert(1)>x</b>';
    const m = plano(
      c.montarAvisoEquipe({
        nome: ruim,
        email: ruim,
        nomeEmpresa: `${ruim}\nBcc: alguem@x.com ${'x'.repeat(300)}`,
        telefone: ruim,
        codigo: 'NORTE-ABCD-EF23',
        emailEnviado: true,
      })
    );
    assert.ok(!m.corpoHtml.includes('<b onmouseover'));
    assert.ok(!/[\r\n]/.test(m.assunto) && m.assunto.length < 110, `assunto: ${m.assunto.length}`);
  }
);

// ======================= a função inteira =======================
test(
  'pedido normal: código no formato certo, e-mail ao lead (com a chave de serviço), aviso à equipe e resposta completa',
  opcoes,
  async () => {
    const f = montarFuncao({
      env: { URL_SITE: 'https://sistema.inetris.com.br', EMAIL_EQUIPE: 'equipe@inetris.com.br' },
    });
    const r = await f.chamar({ ...PEDIDO, email: ' ANA@Empresa.com ' });
    assert.equal(r.status, 200);
    assert.match(r.json.codigo, FORMATO_CODIGO);
    assert.deepEqual([r.json.emailEnviado, r.json.reaproveitado], [true, false]);
    assert.equal(r.json.urlCadastro, `https://sistema.inetris.com.br/app.html#cadastro&codigo=${r.json.codigo}`);
    const [codigoSalvo] = f.banco.tabelas.codigos_licenca_empresa;
    assert.deepEqual(
      [codigoSalvo.codigo, codigoSalvo.trial_dias, codigoSalvo.nome_empresa_sugerido, codigoSalvo.usado],
      [r.json.codigo, 7, 'Loja Aurora', false]
    );
    const [pedido] = f.banco.tabelas.solicitacoes_teste;
    assert.deepEqual(
      [pedido.email, pedido.status, pedido.codigo_gerado, pedido.nome_solicitante],
      ['ana@empresa.com', 'aprovada', r.json.codigo, 'Ana Souza']
    );
    const [paraLead, paraEquipe] = f.chamadas.emails;
    assert.equal(paraLead.destinatario, 'ana@empresa.com');
    assert.equal(paraLead.autorizacao, 'Bearer CHAVE-DE-SERVICO');
    assert.ok(
      paraLead.corpoHtml.includes(r.json.urlCadastro.replace(/&/g, '&amp;')) &&
        paraLead.corpoHtml.includes(r.json.codigo)
    );
    assert.equal(paraEquipe.destinatario, 'equipe@inetris.com.br');
    assert.equal(paraEquipe.assunto, 'Novo teste grátis: Loja Aurora');
    assert.equal(f.chamadas.emails.length, 2);
  }
);

test(
  'sem o segredo do aviso, a equipe recebe no endereço padrão; sem URL_SITE o botão usa o endereço padrão',
  opcoes,
  async () => {
    const f = montarFuncao();
    const r = await f.chamar(PEDIDO);
    assert.equal(f.chamadas.emails[1].destinatario, 'inetris25@gmail.com');
    assert.ok(r.json.urlCadastro.startsWith('https://rhalley21.github.io/Sistema-Norte/app.html#cadastro&codigo='));
  }
);

test(
  'o e-mail do código FALHOU: o lead recebe o código na resposta (a tela o mostra) e a equipe é avisada com o código para entregar',
  opcoes,
  async () => {
    const f = montarFuncao({ emailSai: (para) => para !== 'ana@empresa.com' });
    const r = await f.chamar(PEDIDO);
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.emailEnviado, !!r.json.codigo], [false, true]);
    const aviso = f.chamadas.emails.find((e) => e.destinatario === 'inetris25@gmail.com');
    assert.ok(aviso.assunto.startsWith('ATENÇÃO') && aviso.corpoHtml.includes(r.json.codigo));
  }
);

test('o aviso à equipe falhar não atrapalha o lead', opcoes, async () => {
  const f = montarFuncao({ emailSai: (para) => para === 'ana@empresa.com' });
  const r = await f.chamar(PEDIDO);
  assert.deepEqual([r.status, r.json.emailEnviado], [200, true]);
});

test(
  'quem pede de novo (perdeu o e-mail) recebe o MESMO código e o e-mail de novo, sem aviso duplicado à equipe; o 3º pedido do dia é barrado',
  opcoes,
  async () => {
    const f = montarFuncao();
    const primeiro = await f.chamar(PEDIDO);
    f.chamadas.emails.length = 0;
    const segundo = await f.chamar({ ...PEDIDO, email: 'ANA@empresa.com' });
    assert.equal(segundo.status, 200);
    assert.deepEqual([segundo.json.codigo, segundo.json.reaproveitado], [primeiro.json.codigo, true]);
    assert.equal(f.banco.tabelas.codigos_licenca_empresa.length, 1, 'não gerou outro código');
    assert.equal(f.banco.tabelas.solicitacoes_teste.length, 1);
    assert.deepEqual(
      f.chamadas.emails.map((e) => e.destinatario),
      ['ana@empresa.com'],
      'reenviou ao lead e NÃO avisou a equipe de novo'
    );
    const terceiro = await f.chamar(PEDIDO);
    assert.equal(terceiro.status, 429);
    assert.match(terceiro.json.error, /duas vezes hoje/);
    assert.match(terceiro.json.error, /WhatsApp/);
  }
);

test('código que já foi USADO não é reaproveitado: gera um novo', opcoes, async () => {
  const f = montarFuncao();
  const primeiro = await f.chamar(PEDIDO);
  f.banco.tabelas.codigos_licenca_empresa[0].usado = true;
  const segundo = await f.chamar(PEDIDO);
  assert.equal(segundo.status, 200);
  assert.notEqual(segundo.json.codigo, primeiro.json.codigo);
  assert.equal(segundo.json.reaproveitado, false);
});

test(
  'pedido com erro (robô, campo vazio, e-mail inválido) NÃO gasta a cota de pedidos válidos; só conta como tentativa',
  opcoes,
  async () => {
    const f = montarFuncao({ recaptcha: false });
    assert.equal((await f.chamar(PEDIDO)).status, 400);
    const f2 = montarFuncao();
    assert.equal((await f2.chamar({ ...PEDIDO, nome: '' })).status, 400);
    assert.equal((await f2.chamar({ ...PEDIDO, email: 'isto nao e email' })).status, 400);
    for (const banco of [f.banco, f2.banco]) {
      assert.equal(contagem(banco, 'teste_gratis'), 0);
      assert.equal(contagem(banco, 'teste_gratis_email'), 0);
      assert.ok(contagem(banco, 'teste_gratis_tentativa') >= 1);
      assert.equal(banco.tabelas.codigos_licenca_empresa.length, 0);
    }
  }
);

test(
  'IP compartilhado (operadora de celular): 10 pedidos válidos passam mesmo depois de tentativas com erro; o 11º é barrado',
  opcoes,
  async () => {
    let robo = true;
    const f = montarFuncao({ recaptcha: () => !robo });
    for (let i = 0; i < 5; i++) assert.equal((await f.chamar(PEDIDO)).status, 400); // 5 tentativas que falharam no reCAPTCHA
    robo = false;
    for (let i = 0; i < 10; i++)
      assert.equal((await f.chamar({ ...PEDIDO, email: `pessoa${i}@empresa.com` })).status, 200, `pedido ${i + 1}`);
    const onze = await f.chamar({ ...PEDIDO, email: 'pessoa11@empresa.com' });
    assert.equal(onze.status, 429);
    assert.match(onze.json.error, /deste endereço hoje/);
    assert.equal(
      (await f.chamar({ ...PEDIDO, email: 'outra@empresa.com' }, { ip: '198.51.100.7' })).status,
      200,
      'outro IP não é afetado'
    );
  }
);

test(
  'quem martela a função (mais de 30 chamadas em uma hora do mesmo IP) é barrado, com ou sem erro',
  opcoes,
  async () => {
    const f = montarFuncao({ recaptcha: false });
    for (let i = 0; i < 30; i++) assert.equal((await f.chamar(PEDIDO)).status, 400);
    const barrado = await f.chamar(PEDIDO);
    assert.equal(barrado.status, 429);
    assert.match(barrado.json.error, /Muitas tentativas/);
    assert.equal(f.chamadas.recaptcha, 30, 'depois do limite nem consulta o Google');
  }
);

test('o mesmo e-mail pode pedir de IPs diferentes, mas o limite por e-mail vale para todos', opcoes, async () => {
  const f = montarFuncao();
  assert.equal((await f.chamar(PEDIDO, { ip: '10.0.0.1' })).status, 200);
  assert.equal((await f.chamar(PEDIDO, { ip: '10.0.0.2' })).status, 200);
  assert.equal((await f.chamar(PEDIDO, { ip: '10.0.0.3' })).status, 429);
});

test('nome, empresa e telefone com HTML: o e-mail do lead e o aviso à equipe saem escapados', opcoes, async () => {
  const f = montarFuncao();
  const ruim = '<img src=x onerror=alert(1)>';
  const r = await f.chamar({ ...PEDIDO, nome: ruim, empresa: ruim, telefone: ruim });
  assert.equal(r.status, 200);
  for (const e of f.chamadas.emails) assert.ok(!e.corpoHtml.includes('<img src=x'), e.destinatario);
});

test(
  'OPTIONS responde ao pré-voo do navegador; corpo ilegível vira erro 500 claro, sem derrubar a função',
  opcoes,
  async () => {
    const f = montarFuncao();
    const opcoesResp = await f.chamar(null, { metodo: 'OPTIONS' });
    assert.equal(opcoesResp.status, 200);
    assert.equal(opcoesResp.texto, 'ok');
    const ruim = await f.chamar(new Error('json quebrado'));
    assert.equal(ruim.status, 500);
    assert.match(ruim.json.error, /Erro interno/);
  }
);

test(
  'a ordem das verificações: tentativa, reCAPTCHA, campos, e-mail e IP válidos, reaproveitar, gerar, e-mail, aviso (leitura do código)',
  opcoes,
  () => {
    const ordem = [
      'teste_gratis_tentativa',
      'validarRecaptcha(body.recaptchaToken)',
      'emailValido(email)',
      "'teste_gratis_email'",
      "'teste_gratis',",
      "from('solicitacoes_teste').select",
      'gerarCodigoLicenca()',
      'enviarEmail(emailNorm',
      'montarAvisoEquipe(',
    ];
    let pos = -1;
    for (const marca of ordem) {
      const i = origem.indexOf(marca, origem.indexOf('serve(async'));
      assert.ok(i > pos, `"${marca}" fora de ordem`);
      pos = i;
    }
    assert.ok(!/\.ilike\(/.test(origem), 'ilike trata "_" como curinga e poderia entregar o código de outra pessoa');
    assert.ok(/\.eq\('email', emailNorm\)/.test(origem));
  }
);

test('o número do WhatsApp é o mesmo da função do servidor, das rotinas diárias e da tela de entrada', opcoes, () => {
  const rotinas = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'rotinas-agendadas', 'index.ts'), 'utf8');
  const entrada = fs.readFileSync(path.join(raiz, 'js', '19-auth.js'), 'utf8');
  for (const [nome, texto] of [
    ['teste-gratis', origem],
    ['rotinas-agendadas', rotinas],
    ['19-auth.js', entrada],
  ])
    assert.ok(texto.includes('558999857062'), nome);
});
