// =========================================================================
// Teste grátis, lado do NAVEGADOR: (1) js/58 preenche o cadastro com o código que vem no endereço; (2) a página inicial mostra
// o código na tela de sucesso (DOM simulado); (3) as três pontas falam o mesmo "idioma": o botão do e-mail, o botão da página
// inicial e o preenchimento do cadastro; (4) a tela de entrada (js/19) e a marca.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { JSDOM } = require('jsdom');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const CODIGO = 'NORTE-ABCD-EF23';

// ---------- js/58 num contexto com as variáveis do formulário de entrada ----------
function cenario58({ hash = '', sessao = null, armazenamentoQuebrado = false } = {}) {
  const chamadas = { replaceState: [], removidos: [] };
  const janela = {
    location: { hash, pathname: '/app.html', search: '?x=1' },
    history: { replaceState: (...a) => chamadas.replaceState.push(a) },
    get sessionStorage() {
      if (armazenamentoQuebrado) throw new Error('armazenamento bloqueado');
      return {
        getItem: (k) => (k === 'inetris_prefill_cadastro' ? sessao : null),
        removeItem: (k) => chamadas.removidos.push(k),
      };
    },
  };
  const ctx = vm.createContext({ URLSearchParams, console, String, JSON, Object, window: janela });
  vm.runInContext(
    'let modoLogin = "entrar"; let temConviteLogin = true; let valorNomeLogin = ""; let valorEmailLogin = ""; let valorEmpresaLogin = ""; let valorCodigoLicencaLogin = "";',
    ctx
  );
  vm.runInContext(ler('js/58-teste-gratis.js'), ctx);
  const estado = () =>
    plano(
      vm.runInContext(
        '({ modoLogin, temConviteLogin, valorNomeLogin, valorEmailLogin, valorEmpresaLogin, valorCodigoLicencaLogin })',
        ctx
      )
    );
  return { ctx, chamadas, estado, rodar: (c) => vm.runInContext(c, ctx) };
}

test('o código do endereço: só vale com #cadastro e no formato de um código de teste; minúsculas são aceitas', () => {
  const { rodar } = cenario58();
  const lido = (h) => rodar(`lerCodigoDoEndereco(${J(h)})`);
  assert.equal(lido(`#cadastro&codigo=${CODIGO}`), CODIGO);
  assert.equal(lido(`cadastro&codigo=${CODIGO.toLowerCase()}`), CODIGO);
  assert.equal(lido(`#codigo=${CODIGO}`), null, 'sem #cadastro não é para este fluxo');
  for (const ruim of [
    '',
    '#',
    '#cadastro',
    '#cadastro&codigo=',
    '#cadastro&codigo=abc',
    '#cadastro&codigo=NORTE-ABCD-EF2',
    '#cadastro&codigo=NORTE-ABCD-EF23X',
    '#cadastro&codigo=NORTE-0BCD-EF23',
    '#cadastro&codigo=<script>',
    '#cadastro&codigo=NORTE-ABCD-EF23%20OR%201',
  ])
    assert.equal(lido(ruim), null, ruim);
  assert.equal(rodar('lerCodigoDoEndereco(undefined)'), null);
});

test('um link de recuperação de senha ou de confirmação (com type/access_token) não é tratado como cadastro do teste', () => {
  const { rodar } = cenario58();
  assert.equal(rodar('lerCodigoDoEndereco("#access_token=abc&type=recovery&refresh_token=x")'), null);
});

test('nome, e-mail e empresa da sessão: com limite de tamanho; vazio ou quebrado vira {}', () => {
  const { rodar } = cenario58();
  const lido = (bruto) => plano(rodar(`lerPrefillDaSessao({ getItem: () => ${J(bruto)} })`));
  assert.deepEqual(lido(J({ nome: '  Ana  ', email: 'ana@x.com', empresa: 'Loja' })), {
    nome: 'Ana',
    email: 'ana@x.com',
    empresa: 'Loja',
  });
  const longo = lido(J({ nome: 'n'.repeat(500), email: 'e'.repeat(500), empresa: 'm'.repeat(500) }));
  assert.deepEqual([longo.nome.length, longo.email.length, longo.empresa.length], [120, 254, 160]);
  assert.deepEqual(lido(null), {});
  assert.deepEqual(lido('isto não é JSON'), {});
  assert.deepEqual(lido(J({ nome: null })), { nome: '', email: '', empresa: '' });
  assert.deepEqual(plano(rodar('lerPrefillDaSessao({ getItem: () => { throw new Error("x"); } })')), {});
});

test('chegar pelo link do teste: abre o Cadastrar, sem convite, com o código, o nome, o e-mail e a empresa; depois limpa o endereço e a sessão', () => {
  const c = cenario58({
    hash: `#cadastro&codigo=${CODIGO}`,
    sessao: J({ nome: 'Ana Souza', email: 'ana@empresa.com', empresa: 'Loja Aurora' }),
  });
  assert.equal(c.rodar('aplicarPrefillCadastro()'), true);
  assert.deepEqual(c.estado(), {
    modoLogin: 'cadastrar',
    temConviteLogin: false,
    valorNomeLogin: 'Ana Souza',
    valorEmailLogin: 'ana@empresa.com',
    valorEmpresaLogin: 'Loja Aurora',
    valorCodigoLicencaLogin: CODIGO,
  });
  assert.deepEqual(
    plano(c.chamadas.replaceState),
    [[null, '', '/app.html?x=1']],
    'o código sai do endereço (a busca "?x=1" fica)'
  );
  assert.deepEqual(c.chamadas.removidos, ['inetris_prefill_cadastro']);
});

test('chegar só com o link do e-mail (outro aparelho, sem sessão): preenche o código e deixa os outros campos como estão', () => {
  const c = cenario58({ hash: `#cadastro&codigo=${CODIGO}` });
  assert.equal(c.rodar('aplicarPrefillCadastro()'), true);
  assert.deepEqual(c.estado(), {
    modoLogin: 'cadastrar',
    temConviteLogin: false,
    valorNomeLogin: '',
    valorEmailLogin: '',
    valorEmpresaLogin: '',
    valorCodigoLicencaLogin: CODIGO,
  });
});

test('navegador que bloqueia o armazenamento: segue só com o código, sem quebrar', () => {
  const c = cenario58({ hash: `#cadastro&codigo=${CODIGO}`, armazenamentoQuebrado: true });
  assert.equal(c.rodar('aplicarPrefillCadastro()'), true);
  assert.equal(c.estado().valorCodigoLicencaLogin, CODIGO);
});

test('sem código válido no endereço NADA muda (nem o endereço, nem a sessão)', () => {
  for (const hash of ['', '#cadastro&codigo=lixo', '#access_token=a&type=recovery']) {
    const c = cenario58({ hash, sessao: J({ nome: 'Ana' }) });
    assert.equal(c.rodar('aplicarPrefillCadastro()'), false, hash);
    assert.deepEqual(c.estado(), {
      modoLogin: 'entrar',
      temConviteLogin: true,
      valorNomeLogin: '',
      valorEmailLogin: '',
      valorEmpresaLogin: '',
      valorCodigoLicencaLogin: '',
    });
    assert.deepEqual([c.chamadas.replaceState.length, c.chamadas.removidos.length], [0, 0]);
  }
});

// ---------- a página inicial (DOM simulado) ----------
function abrirLanding({ resposta, recaptcha = 'tok' }) {
  const html = ler('index.html').replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, '');
  const chamadas = { fetch: [], copiado: [], resets: 0 };
  const virtual = new (require('jsdom').VirtualConsole)();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://sistema.inetris.com.br/',
    pretendToBeVisual: true,
    virtualConsole: virtual,
    beforeParse(w) {
      w.NORTE_AMBIENTE = { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon-key' };
      w.IntersectionObserver = class {
        observe() {}
        unobserve() {}
      };
      w.Sentry = { init() {}, captureException() {} };
      w.grecaptcha = { render: () => 3, getResponse: () => recaptcha, reset: () => chamadas.resets++ };
      Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: (t) => (chamadas.copiado.push(t), Promise.resolve()) },
      });
      w.fetch = async (url, init) => {
        chamadas.fetch.push({ url, init });
        const r = typeof resposta === 'function' ? resposta() : resposta;
        return { ok: r.ok !== false, json: async () => r.json };
      };
    },
  });
  const w = dom.window;
  const preencher = (nome, email, empresa, tel = '') => {
    w.document.getElementById('tg-nome').value = nome;
    w.document.getElementById('tg-email').value = email;
    w.document.getElementById('tg-empresa').value = empresa;
    w.document.getElementById('tg-telefone').value = tel;
  };
  return { w, doc: w.document, chamadas, preencher, enviar: () => w.enviarTesteGratisLanding() };
}
const OK = (extra) => ({ ok: true, json: { codigo: CODIGO, emailEnviado: true, reaproveitado: false, ...extra } });

test('página inicial: o aviso de privacidade fica junto do botão, com os links dos Termos e da Política', () => {
  const l = abrirLanding({ resposta: OK() });
  const cartao = l.doc.getElementById('teste_gratis_card');
  assert.ok(
    cartao.textContent
      .replace(/\s+/g, ' ')
      .includes('Ao solicitar, você concorda com os Termos de Uso e a Política de Privacidade')
  );
  assert.deepEqual(
    [...cartao.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ['termos.html', 'privacidade.html']
  );
});

test('sucesso: o CÓDIGO aparece na tela, com botão de copiar e botão que leva ao cadastro com o código; o e-mail é só um reforço', async () => {
  const l = abrirLanding({ resposta: OK() });
  l.preencher('Ana Souza', 'ana@empresa.com', 'Loja Aurora', '(89) 99999-1234');
  await l.enviar();
  const doc = l.doc;
  assert.equal(doc.getElementById('tg-codigo').textContent, CODIGO);
  assert.equal(doc.getElementById('tg-criar-conta').getAttribute('href'), `app.html#cadastro&codigo=${CODIGO}`);
  assert.ok(doc.getElementById('teste_gratis_form').textContent.includes('Teste liberado!'));
  assert.ok(
    doc.getElementById('teste_gratis_form').textContent.includes('Também enviamos o código para ana@empresa.com')
  );
  doc.getElementById('tg-copiar').click();
  assert.deepEqual(l.chamadas.copiado, [CODIGO]);
  await new Promise((r) => setImmediate(r));
  assert.equal(doc.getElementById('tg-copiar').textContent, 'Código copiado!');
  // o pedido que saiu
  const [{ url, init }] = l.chamadas.fetch;
  assert.equal(url, 'https://x.supabase.co/functions/v1/teste-gratis');
  assert.deepEqual(plano(JSON.parse(init.body)), {
    nome: 'Ana Souza',
    email: 'ana@empresa.com',
    empresa: 'Loja Aurora',
    telefone: '(89) 99999-1234',
    recaptchaToken: 'tok',
  });
  assert.equal(init.headers.Authorization, 'Bearer anon-key');
});

test('depois do sucesso, o botão fixo "Testar grátis" do rodapé some (e antes do sucesso ele está lá)', async () => {
  const l = abrirLanding({ resposta: OK() });
  assert.notEqual(l.doc.querySelector('.sticky').style.display, 'none');
  l.preencher('Ana', 'ana@empresa.com', 'Loja');
  await l.enviar();
  assert.equal(l.doc.querySelector('.sticky').style.display, 'none');
});

test('sucesso: nome, e-mail e empresa vão para a sessão do navegador (e o código NÃO, nem nada disso no endereço)', async () => {
  const l = abrirLanding({ resposta: OK() });
  l.preencher('Ana Souza', 'ana@empresa.com', 'Loja Aurora');
  await l.enviar();
  assert.deepEqual(JSON.parse(l.w.sessionStorage.getItem('inetris_prefill_cadastro')), {
    nome: 'Ana Souza',
    email: 'ana@empresa.com',
    empresa: 'Loja Aurora',
  });
  const href = l.doc.getElementById('tg-criar-conta').getAttribute('href');
  assert.ok(!/ana|empresa|Aurora|@/i.test(href.replace(CODIGO, '')), 'só o código no endereço');
});

test('o e-mail do código NÃO saiu: a tela diz isso e mostra o código mesmo assim', async () => {
  const l = abrirLanding({ resposta: OK({ emailEnviado: false }) });
  l.preencher('Ana', 'ana@empresa.com', 'Loja');
  await l.enviar();
  const texto = l.doc.getElementById('teste_gratis_form').textContent;
  assert.ok(texto.includes('Não conseguimos enviar o e-mail agora, mas o seu código está aqui.'));
  assert.ok(!texto.includes('Também enviamos o código'));
  assert.equal(l.doc.getElementById('tg-codigo').textContent, CODIGO);
});

test('código recebido fora do formato: não é mostrado, não vira link e não guarda nada na sessão; a tela cai na mensagem do e-mail', async () => {
  for (const ruim of ['<img src=x onerror=1>', 'NORTE-ABCD', '', undefined]) {
    const l = abrirLanding({ resposta: OK({ codigo: ruim }) });
    l.preencher('Ana', 'ana@empresa.com', 'Loja');
    await l.enviar();
    assert.equal(l.doc.getElementById('tg-codigo'), null, String(ruim));
    assert.equal(l.doc.getElementById('tg-criar-conta'), null);
    assert.equal(l.w.sessionStorage.getItem('inetris_prefill_cadastro'), null);
    assert.ok(l.doc.getElementById('teste_gratis_form').textContent.includes('Confira sua caixa de entrada'));
    assert.equal(l.doc.querySelector('#teste_gratis_form img'), null);
  }
});

test('o e-mail digitado vai para a tela como TEXTO (sem injeção de HTML)', async () => {
  const l = abrirLanding({ resposta: OK() });
  l.preencher('Ana', '<img src=x onerror=alert(1)>@a.com', 'Loja');
  await l.enviar();
  assert.equal(l.doc.querySelector('#teste_gratis_form img'), null);
  assert.ok(l.doc.getElementById('teste_gratis_form').textContent.includes('<img src=x onerror=alert(1)>@a.com'));
});

test('erro do servidor (limite, robô...): a mensagem aparece, o botão volta e o reCAPTCHA é reiniciado; nada é guardado', async () => {
  const l = abrirLanding({
    resposta: {
      ok: false,
      json: {
        error:
          'Você já pediu o código duas vezes hoje. Confira sua caixa de entrada e o spam, ou fale com a gente no WhatsApp.',
      },
    },
  });
  l.preencher('Ana', 'ana@empresa.com', 'Loja');
  await l.enviar();
  const erro = l.doc.getElementById('tg-erro');
  assert.equal(erro.style.display, 'block');
  assert.match(erro.textContent, /duas vezes hoje/);
  assert.deepEqual(
    [l.doc.getElementById('tg-botao').disabled, l.doc.getElementById('tg-botao').textContent.trim(), l.chamadas.resets],
    [false, 'Solicitar teste grátis', 1]
  );
  assert.equal(l.doc.getElementById('tg-codigo'), null);
  assert.equal(l.w.sessionStorage.getItem('inetris_prefill_cadastro'), null);
});

test('campos vazios ou reCAPTCHA não marcado: avisa na hora, sem chamar o servidor', async () => {
  const l = abrirLanding({ resposta: OK() });
  l.preencher('', 'a@b.com', 'Loja');
  await l.enviar();
  assert.equal(l.doc.getElementById('tg-erro').textContent, 'Preencha nome, e-mail e nome da empresa.');
  const l2 = abrirLanding({ resposta: OK(), recaptcha: '' });
  l2.preencher('Ana', 'a@b.com', 'Loja');
  await l2.enviar();
  assert.match(l2.doc.getElementById('tg-erro').textContent, /não é um robô/);
  assert.deepEqual([l.chamadas.fetch.length, l2.chamadas.fetch.length], [0, 0]);
});

// ---------- as três pontas falam o mesmo idioma ----------
test('o botão do e-mail e o botão da página inicial levam ao mesmo lugar, e o cadastro entende os dois', async () => {
  const origemFn = ler('supabase/functions/teste-gratis/index.ts');
  const fn = origemFn.slice(origemFn.indexOf('function linkDeCadastro'), origemFn.indexOf('function linkWhatsApp'));
  const sCtx = vm.createContext({ encodeURIComponent });
  vm.runInContext(nodeModule.stripTypeScriptTypes(fn), sCtx);
  const doEmail = new URL(vm.runInContext(`linkDeCadastro('https://sistema.inetris.com.br/', ${J(CODIGO)})`, sCtx));
  const l = abrirLanding({ resposta: OK() });
  l.preencher('Ana', 'ana@empresa.com', 'Loja');
  await l.enviar();
  const daPagina = new URL(
    l.doc.getElementById('tg-criar-conta').getAttribute('href'),
    'https://sistema.inetris.com.br/'
  );
  assert.equal(doEmail.href, daPagina.href, 'mesmo endereço');
  const { rodar } = cenario58();
  assert.equal(rodar(`lerCodigoDoEndereco(${J(daPagina.hash)})`), CODIGO);
  // e a chave da sessão é a mesma nas duas pontas
  assert.equal(rodar('PREFILL_CADASTRO_CHAVE'), 'inetris_prefill_cadastro');
  assert.ok(l.w.sessionStorage.getItem(rodar('PREFILL_CADASTRO_CHAVE')));
});

test('o formato do código aceito pelo cadastro é o que a função do servidor gera (mesmo alfabeto)', () => {
  const alfabeto = /const chars = '([A-Z2-9]+)'/.exec(ler('supabase/functions/teste-gratis/index.ts'))[1];
  assert.ok(!/[01OI]/.test(alfabeto), 'sem 0/O/1/I');
  const { rodar } = cenario58();
  for (const ch of alfabeto)
    assert.ok(rodar(`CODIGO_TESTE_FORMATO.test('NORTE-${ch}${ch}${ch}${ch}-${ch}${ch}${ch}${ch}')`), ch);
});

// ---------- a tela de entrada (js/19) ----------
const auth = ler('js/19-auth.js');
test('tela de entrada: o erro é ESCAPADO (antes ia cru para o HTML) e o botão de WhatsApp só aparece junto da mensagem certa', () => {
  assert.ok(auth.includes('${escaparHtml(erroLogin)}'));
  assert.ok(!/\$\{erroLogin\}/.test(auth), 'nenhuma mensagem de erro entra sem escape');
  assert.ok(/erroLogin && erroLogin === erroContratarLogin/.test(auth));
  assert.ok(/Falar no WhatsApp para continuar/.test(auth));
});

test('teste expirado e acesso suspenso mostram o botão do WhatsApp; a mensagem do 8º dia diz que os dados continuam guardados', () => {
  const exp = /:\s*'(Seu teste grátis de 7 dias expirou[^']*)';\s*erroContratarLogin = erroLogin;/.exec(auth);
  assert.ok(exp, 'teste expirado não liga o botão');
  assert.ok(exp[1].includes('Seus dados continuam guardados') && exp[1].includes('escolha um plano'));
  assert.ok(
    /temporariamente suspenso[^']*';\s*erroContratarLogin = erroLogin;/.test(auth),
    'acesso suspenso não liga o botão'
  );
  assert.ok(auth.includes('https://wa.me/558999857062'));
});

test('a abertura preenche o cadastro ANTES de desenhar a tela de entrada, e o js/58 está no app.html', () => {
  const i = auth.indexOf('aplicarPrefillCadastro()');
  const j = auth.indexOf('renderTelaAuth();', i);
  assert.ok(i > 0 && j > i, 'o preenchimento tem de vir antes de renderTelaAuth()');
  assert.ok(ler('app.html').includes('js/58-teste-gratis.js'));
});

test('a abertura espera a página terminar de carregar antes de desenhar a entrada (senão o js/58 chega tarde e o cadastro abre vazio)', () => {
  const i = auth.indexOf('function _chamarRenderTelaAuthQuandoPronto()');
  const corpo = auth.slice(i, auth.indexOf('renderTelaAuth();', i));
  assert.ok(/document\.readyState === 'loading'/.test(corpo), 'sem a espera pelo fim do carregamento');
  assert.ok(/typeof renderTelaAuth !== 'function'/.test(corpo));
  assert.ok(/setTimeout\(_chamarRenderTelaAuthQuandoPronto, 50\)/.test(corpo));
});

test('a marca é INETRIS nos e-mails de cadastro, de convite e de avaliação, e na tela de nova senha (sem "Plataforma NORTE")', () => {
  for (const f of ['js/19-auth.js', 'js/06-page-usuarios.js', 'js/15-page-ciclos-avaliacao.js'])
    assert.ok(!/Plataforma NORTE/.test(ler(f)), f);
  assert.ok(auth.includes("'Bem-vindo(a) ao INETRIS'"));
  assert.ok(
    auth.includes('<div class="brand-name">INETRIS</div>') && !auth.includes('<div class="brand-name">NORTE</div>')
  );
  assert.ok(ler('js/06-page-usuarios.js').includes('convidado para o INETRIS'));
});
