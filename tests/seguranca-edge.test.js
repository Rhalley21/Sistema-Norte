// =========================================================================
// Testa as correções de SEGURANÇA das Edge Functions que recebem dado de fora:
//  - enviar-email: antes era um canal aberto (qualquer remetente, destinatário,
//    sem login nem limite);
//  - candidatura (rs) e teste-gratis: e-mail sem validar, nome direto no HTML,
//    perfil em JSON livre;
//  - login-bloqueio: qualquer um podia travar a conta de outra pessoa.
// Os trechos testados são os do PRÓPRIO código das funções (tipos removidos).
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
const plano = (x) => JSON.parse(JSON.stringify(x));
const ler = (fn) => fs.readFileSync(path.join(raiz, 'supabase', 'functions', fn, 'index.ts'), 'utf8');

function carregar(fn, de, ate) {
  const origem = ler(fn);
  const ini = origem.indexOf(de);
  const fim = origem.indexOf(ate, ini);
  assert.ok(ini >= 0 && fim > ini, `não achei o trecho "${de}" em ${fn}`);
  const ctx = vm.createContext({ console, String, Array, Object, JSON, Set, Date, Math, Number });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}
const emailFn = () => carregar('enviar-email', 'function emailValido', 'serve(async');

// ---------- validação de e-mail (a mesma regra nas 3 funções) ----------
const VALIDOS = ['maria@empresa.com.br', 'a.b+c@dominio.co', 'nome_sobrenome@sub.dominio.org'];
const INVALIDOS = [
  '',
  'sem-arroba',
  'a@b',
  'a@b.c',
  'dois@a.com,tres@b.com',
  'a@b.com;c@d.com',
  'com espaço@a.com',
  '<script>@a.com',
  'a@b.com>',
  '"x"@a.com',
  null,
  undefined,
  123,
  'a'.repeat(250) + '@b.com',
];

test('emailValido (enviar-email): aceita e-mail comum, recusa listas, espaços, HTML e lixo', opcoes, () => {
  const c = emailFn();
  VALIDOS.forEach((e) => assert.equal(c.emailValido(e), true, e));
  INVALIDOS.forEach((e) => assert.equal(c.emailValido(e), false, String(e)));
});

test('emailValido: a MESMA regra em enviar-email, teste-gratis e rs (não podem divergir)', opcoes, () => {
  const a = emailFn();
  const b = carregar('teste-gratis', 'function emailValido', 'function escaparHtml');
  const r = carregar('rs', 'function emailValido', 'function escaparHtml');
  [...VALIDOS, ...INVALIDOS].forEach((e) => {
    assert.equal(b.emailValido(e), a.emailValido(e), `teste-gratis diverge em ${String(e)}`);
    assert.equal(r.emailValido(e), a.emailValido(e), `rs diverge em ${String(e)}`);
  });
});

// ---------- enviar-email ----------
test('limparAssunto: tira quebras de linha (injeção de cabeçalho), apara e limita a 200 caracteres', opcoes, () => {
  const c = emailFn();
  assert.equal(c.limparAssunto('Olá\r\nBcc: vitima@x.com'), 'Olá Bcc: vitima@x.com');
  assert.equal(c.limparAssunto('  oi  '), 'oi');
  assert.equal(c.limparAssunto('x'.repeat(500)).length, 200);
  assert.equal(c.limparAssunto(null), '');
  assert.equal(c.limparAssunto(42), '');
});

test('iguaisSeguro: compara texto sem vazar por tempo e recusa tamanhos diferentes', opcoes, () => {
  const c = emailFn();
  assert.equal(c.iguaisSeguro('abc', 'abc'), true);
  assert.equal(c.iguaisSeguro('abc', 'abd'), false);
  assert.equal(c.iguaisSeguro('abc', 'abcd'), false);
  assert.equal(c.iguaisSeguro('', ''), true);
});

test('enviar-email: não existe mais o campo "remetente" nem chamada anônima (regressão)', () => {
  const origem = ler('enviar-email');
  assert.ok(!/remetente\s*\|\|/.test(origem), 'o remetente não pode mais vir do chamador');
  assert.ok(!/const\s*\{[^}]*remetente[^}]*\}\s*=\s*await\s*req\.json/.test(origem));
  assert.ok(origem.includes('auth.getUser'), 'precisa autenticar o usuário');
  assert.ok(
    origem.includes('iguaisSeguro(token, chaveServico)'),
    'precisa aceitar a chave de serviço das outras funções'
  );
  assert.ok(
    origem.includes("'rate_limit_log'") && origem.includes('LIMITE_EMPRESA_DIA_TESTE'),
    'precisa ter limites, mais baixos pra empresa em teste'
  );
  assert.ok(/from:\s*REMETENTE_PADRAO/.test(origem));
});

test('enviar-email: as outras funções que mandam e-mail usam a chave de serviço (senão seriam recusadas)', () => {
  ['rs', 'ponto', 'teste-gratis'].forEach((fn) => {
    const origem = ler(fn);
    const idx = origem.indexOf('/functions/v1/enviar-email');
    assert.ok(idx > 0, `${fn} não chama enviar-email?`);
    assert.ok(
      origem.slice(idx, idx + 400).includes('SUPABASE_SERVICE_ROLE_KEY'),
      `${fn} chama enviar-email sem a chave de serviço`
    );
  });
});

// ---------- candidatura (rs) ----------
test('sanitizarPerfilCandidato: só passam os campos do formulário, com tipo certo e tamanho limitado', opcoes, () => {
  const c = carregar('rs', 'const PERFIL_CAMPOS_TEXTO', 'serve(async');
  const r = plano(
    c.sanitizarPerfilCandidato({
      maior18: true,
      cidadeAtual: '  Teresina  ',
      experienciaAnteriorFuncao: 'x'.repeat(5000),
      possuiMoto: 'sim', // tipo errado: descartado
      campoInventado: 'lixo',
      __proto__: { x: 1 },
      linkedin: 'https://linkedin.com/in/fulano',
    })
  );
  assert.equal(r.maior18, true);
  assert.equal(r.cidadeAtual, 'Teresina');
  assert.equal(r.experienciaAnteriorFuncao.length, 1000);
  assert.equal(r.possuiMoto, undefined);
  assert.equal(r.campoInventado, undefined);
  assert.equal(r.linkedin, 'https://linkedin.com/in/fulano');
});

test('sanitizarPerfilCandidato: entrada que não é objeto vira {}', opcoes, () => {
  const c = carregar('rs', 'const PERFIL_CAMPOS_TEXTO', 'serve(async');
  [null, undefined, 'texto', 42, [], [{ maior18: true }]].forEach((x) =>
    assert.deepEqual(plano(c.sanitizarPerfilCandidato(x)), {})
  );
});

test('escaparHtml (servidor): neutraliza HTML e aspas — nome de candidato não vira link no e-mail', opcoes, () => {
  const c = carregar('rs', 'function escaparHtml', 'const PERFIL_CAMPOS_TEXTO');
  assert.equal(c.escaparHtml('<a href="http://x">clique</a>'), '&lt;a href=&quot;http://x&quot;&gt;clique&lt;/a&gt;');
  assert.equal(c.escaparHtml("a'b&c"), 'a&#39;b&amp;c');
  assert.equal(c.escaparHtml(null), '');
});

test('candidatura: o currículo é obrigatório no servidor e o nome é escapado no e-mail (regressão)', () => {
  const origem = ler('rs');
  assert.ok(origem.includes("'Anexe o currículo em PDF.'"));
  assert.ok(origem.includes('escaparHtml(nome)'));
  assert.ok(!origem.includes('${body.nome}'), 'não pode interpolar o nome cru no HTML');
  assert.ok(origem.includes('sanitizarPerfilCandidato(body.perfil)'));
});

// ---------- teste-gratis ----------
test('teste-gratis: valida o e-mail e escapa nome/empresa no HTML (regressão)', () => {
  const origem = ler('teste-gratis');
  assert.ok(origem.includes('emailValido(email)'));
  assert.ok(origem.includes('escaparHtml(nome)') && origem.includes('escaparHtml(nomeEmpresa)'));
  assert.ok(!origem.includes('${nome}') && !origem.includes('${nomeEmpresa}'));
});

// ---------- nenhum e-mail HTML do servidor leva texto de usuário sem escape ----------
test('todo corpoHtml montado no servidor só interpola valores escapados ou conhecidos', () => {
  const PERMITIDOS = /^(escaparHtml\(|codigo\b|diasPendente\b)/;
  const ofensores = [];
  fs.readdirSync(path.join(raiz, 'supabase', 'functions')).forEach((fn) => {
    ler(fn)
      .split('\n')
      .forEach((linha, i) => {
        if (!/corpoHtml:\s*`/.test(linha)) return; // só templates de HTML (não mensagens de erro que citam o campo)
        for (const m of linha.matchAll(/\$\{([^}]*)\}/g)) {
          if (!PERMITIDOS.test(m[1].trim())) ofensores.push(`${fn}:${i + 1}  \${${m[1]}}`);
        }
      });
  });
  // As linhas seguintes de um template multilinha também contam:
  fs.readdirSync(path.join(raiz, 'supabase', 'functions')).forEach((fn) => {
    const linhas = ler(fn).split('\n');
    linhas.forEach((linha, i) => {
      if (!/corpoHtml:\s*`[^`]*$/.test(linha)) return; // template que continua nas próximas linhas
      for (let j = i + 1; j < linhas.length && !linhas[j].includes('`'); j++) {
        for (const m of linhas[j].matchAll(/\$\{([^}]*)\}/g))
          if (!PERMITIDOS.test(m[1].trim())) ofensores.push(`${fn}:${j + 1}  \${${m[1]}}`);
      }
    });
  });
  assert.deepEqual(ofensores, [], 'texto de usuário no HTML do e-mail precisa de escaparHtml()');
});

// ---------- login-bloqueio ----------
function lb() {
  return carregar('login-bloqueio', 'function ipDoRequisitante', 'serve(async');
}
const reqFake = (cab) => ({ headers: { get: (k) => cab[k.toLowerCase()] ?? null } });

test('login-bloqueio: a chave de bloqueio é e-mail + IP (o atacante não trava a conta da vítima)', opcoes, () => {
  const c = lb();
  const naVitima = c.chavePara('Maria@Empresa.com', '200.1.1.1');
  const doAtacante = c.chavePara('maria@empresa.com', '9.9.9.9');
  assert.notEqual(naVitima, doAtacante, 'IPs diferentes precisam gerar chaves diferentes');
  assert.equal(
    c.chavePara('  MARIA@empresa.com ', '1.1.1.1'),
    c.chavePara('maria@empresa.com', '1.1.1.1'),
    'e-mail normalizado'
  );
});

test('login-bloqueio: teto por IP tem chave própria, independente do e-mail', opcoes, () => {
  const c = lb();
  assert.equal(c.chaveIp('1.2.3.4'), 'loginip:1.2.3.4');
  assert.notEqual(c.chaveIp('1.2.3.4'), c.chavePara('a@b.com', '1.2.3.4'));
});

test('login-bloqueio: pega o primeiro IP do x-forwarded-for; sem cabeçalho, "desconhecido"', opcoes, () => {
  const c = lb();
  assert.equal(c.ipDoRequisitante(reqFake({ 'x-forwarded-for': '200.1.1.1, 10.0.0.1' })), '200.1.1.1');
  assert.equal(c.ipDoRequisitante(reqFake({ 'cf-connecting-ip': '5.5.5.5' })), '5.5.5.5');
  assert.equal(c.ipDoRequisitante(reqFake({})), 'desconhecido');
});

test('login-bloqueio: simulação — o atacante errando 5x NÃO bloqueia a vítima em outro IP', opcoes, () => {
  const c = lb();
  const falhas = []; // chaves registradas, como no rate_limit_log
  const registrar = (email, ip) => falhas.push(c.chavePara(email, ip));
  const bloqueado = (email, ip) => falhas.filter((k) => k === c.chavePara(email, ip)).length >= 5;
  for (let i = 0; i < 6; i++) registrar('maria@empresa.com', '9.9.9.9'); // atacante
  assert.equal(bloqueado('maria@empresa.com', '9.9.9.9'), true); // ele mesmo fica bloqueado
  assert.equal(bloqueado('maria@empresa.com', '200.1.1.1'), false); // a dona da conta, não
});

// ---------- acesso-sem-email: senha provisória e convite ----------
function sorteio() {
  const origem = ler('acesso-sem-email');
  const ini = origem.indexOf('function sortearTexto');
  const fim = origem.indexOf('serve(async');
  const ctx = vm.createContext({ crypto: globalThis.crypto, Uint8Array, String });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}

test('senha provisória: 12 caracteres, só do alfabeto sem letras ambíguas, e diferente a cada vez', opcoes, () => {
  const c = sorteio();
  const vistas = new Set();
  for (let i = 0; i < 500; i++) {
    const senha = c.gerarSenhaProvisoria();
    assert.equal(senha.length, 12);
    assert.match(senha, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/); // sem 0/O/1/I/l
    vistas.add(senha);
  }
  assert.equal(vistas.size, 500);
});

test('código de convite: formato NORTE-XXXXXXXX com alfabeto sem ambiguidade', opcoes, () => {
  const c = sorteio();
  for (let i = 0; i < 200; i++) assert.match(c.gerarCodigoConvite(), /^NORTE-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
});

test('sortearTexto: distribuição uniforme (sem viés de módulo)', opcoes, () => {
  const c = sorteio();
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // 54 símbolos: 256 % 54 != 0
  const contagem = {};
  const total = 54 * 4000;
  const texto = c.sortearTexto(alfabeto, total);
  for (const ch of texto) contagem[ch] = (contagem[ch] || 0) + 1;
  const esperado = total / alfabeto.length;
  const qui2 = Object.values(contagem).reduce((s, n) => s + (n - esperado) ** 2 / esperado, 0);
  assert.equal(Object.keys(contagem).length, alfabeto.length, 'algum símbolo nunca saiu');
  // 53 graus de liberdade: valor crítico a 99,9% ≈ 90. Com viés de módulo o valor passa de 150.
  assert.ok(qui2 < 90, `distribuição enviesada (qui² = ${qui2.toFixed(1)})`);
});

test('nenhuma Edge Function gera segredo (senha, código, token) com Math.random (regressão)', () => {
  ['acesso-sem-email', 'teste-gratis', 'login-bloqueio', 'enviar-email', 'assistente-ajuda', 'folha-ponto'].forEach(
    (fn) => {
      const semComentarios = ler(fn).replace(/\/\/.*$/gm, ''); // o aviso explicando o bug cita Math.random
      assert.ok(!semComentarios.includes('Math.random'), `${fn} usa Math.random`);
    }
  );
});

// ---------- ponto: selfie e foto de atestado ----------
function imagens() {
  const origem = ler('ponto');
  const ini = origem.indexOf('// ---- Imagens enviadas');
  const fim = origem.indexOf('// ---- fim: imagens enviadas');
  assert.ok(ini >= 0 && fim > ini);
  const ctx = vm.createContext({ Math, String, Uint8Array, atob });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

test('lerImagemBase64: aceita JPEG, PNG e WebP reais (com ou sem prefixo data:)', opcoes, () => {
  const c = imagens();
  const jpg = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
  const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0];
  assert.equal(c.lerImagemBase64(b64(jpg)).mediaType, 'image/jpeg');
  assert.equal(c.lerImagemBase64('data:image/jpeg;base64,' + b64(jpg)).ext, 'jpg');
  assert.equal(c.lerImagemBase64(b64(png)).mediaType, 'image/png');
  assert.equal(c.lerImagemBase64(b64(webp)).mediaType, 'image/webp');
});

test(
  'lerImagemBase64: lixo, HTML, PDF, vazio e base64 quebrado são recusados (a selfie não pode ser burlada com texto qualquer)',
  opcoes,
  () => {
    const c = imagens();
    assert.equal(c.lerImagemBase64('qualquer coisa que não é imagem'), null);
    assert.equal(c.lerImagemBase64(b64(Buffer.from('<script>alert(1)</script>'))), null);
    assert.equal(c.lerImagemBase64(b64(Buffer.from('%PDF-1.4'))), null);
    assert.equal(c.lerImagemBase64(''), null);
    assert.equal(c.lerImagemBase64(null), null);
    assert.equal(c.lerImagemBase64('!!!não-é-base64!!!'), null);
  }
);

test('lerImagemBase64: recusa imagem acima de 5 MB', opcoes, () => {
  const c = imagens();
  const grande = Buffer.alloc(5 * 1024 * 1024 + 10, 0);
  grande[0] = 0xff;
  grande[1] = 0xd8;
  grande[2] = 0xff;
  assert.equal(c.lerImagemBase64(b64(grande)), null);
  const ok = Buffer.alloc(1024, 0);
  ok[0] = 0xff;
  ok[1] = 0xd8;
  ok[2] = 0xff;
  assert.notEqual(c.lerImagemBase64(b64(ok)), null);
});

test('ponto: selfie obrigatória exige imagem VÁLIDA e guardada (regressão do furo de burlar com texto)', () => {
  const origem = ler('ponto');
  assert.ok(origem.includes('const selfie = body.selfieBase64 ? lerImagemBase64(body.selfieBase64) : null;'));
  assert.ok(
    origem.includes('seg?.exige_selfie && !selfie'),
    'a exigência precisa olhar a imagem validada, não só a presença do campo'
  );
  assert.ok(
    origem.includes("codigo: 'selfie_falhou'"),
    'se a empresa exige selfie e o upload falhou, não pode registrar a batida'
  );
  assert.ok(!origem.includes('seg?.exige_selfie && !body.selfieBase64'));
  assert.ok(!/contentType:\s*'image\/jpeg'/.test(origem), 'o tipo gravado deve ser o detectado pelos bytes');
});
