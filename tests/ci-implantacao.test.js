// =========================================================================
// Testa a automação de CI e de implantação das Edge Functions: a seleção do que
// implantar, a configuração de "Verify JWT" (que, se errada, derruba as funções
// públicas), a segurança dos workflows e se a documentação não ficou pra trás.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const impl = require('../scripts/funcoes-para-implantar.js');
const TODAS = impl.listarFuncoes();

// ---------- seleção do que implantar ----------
test('listarFuncoes: acha todas as Edge Functions do repositório', () => {
  [
    'rs',
    'ponto',
    'nr1',
    'enviar-email',
    'teste-gratis',
    'login-bloqueio',
    'chamado-automatico',
    'assistente-ajuda',
    'folha-ponto',
    'acesso-sem-email',
  ].forEach((n) => assert.ok(TODAS.includes(n), n));
});

test('funcoesAfetadas: só as funções cujos arquivos mudaram', () => {
  assert.deepEqual(impl.funcoesAfetadas(['supabase/functions/rs/index.ts', 'js/40-page-rs.js', 'README.md'], TODAS), [
    'rs',
  ]);
  assert.deepEqual(
    impl.funcoesAfetadas(['supabase/functions/rs/index.ts', 'supabase/functions/ponto/index.ts'], TODAS),
    ['ponto', 'rs']
  );
  assert.deepEqual(
    impl.funcoesAfetadas(['js/02-core-helpers.js', 'CHANGELOG.md', 'sql/38-ajuda-automatica.sql'], TODAS),
    []
  );
});

test('funcoesAfetadas: mexeu no config.toml = reimplanta TODAS (o Verify JWT pode ter mudado)', () => {
  assert.deepEqual(impl.funcoesAfetadas(['supabase/config.toml'], TODAS), [...TODAS].sort());
});

test('funcoesAfetadas: ignora pasta que não é função e aceita caminho do Windows', () => {
  assert.deepEqual(impl.funcoesAfetadas(['supabase/functions/nao-existe/index.ts'], TODAS), []);
  assert.deepEqual(impl.funcoesAfetadas(['supabase\\functions\\rs\\index.ts'], TODAS), ['rs']);
});

test('interpretarPedido: "todas", nomes separados por vírgula, e RECUSA nome desconhecido (nada de texto livre num comando)', () => {
  assert.deepEqual(impl.interpretarPedido('todas', TODAS), [...TODAS].sort());
  assert.deepEqual(impl.interpretarPedido('', TODAS), [...TODAS].sort());
  assert.deepEqual(impl.interpretarPedido('rs, ponto', TODAS), ['ponto', 'rs']);
  assert.deepEqual(impl.interpretarPedido('rs rs', TODAS), ['rs']);
  assert.throws(() => impl.interpretarPedido('rs; rm -rf /', TODAS), /inexistente/);
  assert.throws(() => impl.interpretarPedido('$(whoami)', TODAS), /inexistente/);
  assert.throws(() => impl.interpretarPedido('../outra', TODAS), /inexistente/);
});

test('lerConfiguracao + comConfiguracao: função sem entrada fica com Verify JWT LIGADO (padrão seguro)', () => {
  const cfg = impl.lerConfiguracao();
  const lista = impl.comConfiguracao(['rs', 'ponto', 'funcao-sem-config'], cfg);
  assert.deepEqual(lista, [
    { nome: 'rs', verifyJwt: false },
    { nome: 'ponto', verifyJwt: true },
    { nome: 'funcao-sem-config', verifyJwt: true },
  ]);
});

const temGit = spawnSync('git', ['--version']).status === 0;

test(
  'CLI com repositório git de verdade: implanta só o que mudou entre dois commits',
  { skip: temGit ? false : 'git indisponível neste sistema' },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impl-'));
    const git = (...a) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, encoding: 'utf8' });
    try {
      for (const f of ['a', 'b']) {
        fs.mkdirSync(path.join(dir, 'supabase', 'functions', f), { recursive: true });
        fs.writeFileSync(path.join(dir, 'supabase', 'functions', f, 'index.ts'), `// ${f}\n`);
      }
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.copyFileSync(
        path.join(raiz, 'scripts', 'funcoes-para-implantar.js'),
        path.join(dir, 'scripts', 'funcoes-para-implantar.js')
      );
      fs.writeFileSync(path.join(dir, 'supabase', 'config.toml'), '[functions.b]\nverify_jwt = false\n');
      git('init', '-q');
      git('add', '.');
      git('commit', '-q', '-m', 'um');
      const base = git('rev-parse', 'HEAD').trim();
      fs.appendFileSync(path.join(dir, 'supabase', 'functions', 'b', 'index.ts'), '// mudou\n');
      git('commit', '-qam', 'dois');
      const head = git('rev-parse', 'HEAD').trim();
      const rodar = (...args) =>
        JSON.parse(
          execFileSync(process.execPath, [path.join(dir, 'scripts', 'funcoes-para-implantar.js'), ...args], {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          })
        );
      assert.deepEqual(rodar('--base', base, '--head', head), [{ nome: 'b', verifyJwt: false }]);
      // sem base (primeiro push) ou base inexistente: cai pro lado seguro e implanta tudo
      assert.deepEqual(
        rodar('--base', '0000000000000000000000000000000000000000', '--head', head).map((f) => f.nome),
        ['a', 'b']
      );
      assert.deepEqual(
        rodar('--base', 'deadbeefdeadbeef', '--head', head).map((f) => f.nome),
        ['a', 'b']
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
);

// ---------- configuração do Verify JWT ----------
test('config.toml: toda Edge Function tem uma seção explícita (função nova sem config falha aqui)', () => {
  const cfg = impl.lerConfiguracao();
  TODAS.forEach((n) =>
    assert.ok(cfg[n] && typeof cfg[n].verifyJwt === 'boolean', `supabase/config.toml sem [functions.${n}] verify_jwt`)
  );
  Object.keys(cfg).forEach((n) => assert.ok(TODAS.includes(n), `config.toml fala de uma função que não existe: ${n}`));
});

test('config.toml: só as 6 funções realmente públicas ficam com Verify JWT DESLIGADO', () => {
  const cfg = impl.lerConfiguracao();
  const desligadas = TODAS.filter((n) => cfg[n].verifyJwt === false).sort();
  assert.deepEqual(desligadas, [
    'chamado-automatico',
    'login-bloqueio',
    'rotinas-agendadas',
    'rs',
    'teste-gratis',
    'video-rs',
  ]);
});

test('toda função com Verify JWT desligado se protege sozinha (reCAPTCHA, limite, sessão ou segredo)', () => {
  const cfg = impl.lerConfiguracao();
  TODAS.filter((n) => cfg[n].verifyJwt === false).forEach((n) => {
    const src = ler(`supabase/functions/${n}/index.ts`);
    const seProtege = /validarRecaptcha|rate_limit_log|auth\.getUser|CRON_SECRET/.test(src);
    assert.ok(seProtege, `${n} está pública (Verify JWT desligado) mas não tem proteção própria`);
  });
});

test('toda função com Verify JWT LIGADO realmente confere o usuário (ou é chamada pelo servidor com a chave de serviço)', () => {
  const cfg = impl.lerConfiguracao();
  TODAS.filter((n) => cfg[n].verifyJwt === true).forEach((n) => {
    assert.ok(
      /auth\.getUser/.test(ler(`supabase/functions/${n}/index.ts`)),
      `${n} exige login mas não identifica o usuário`
    );
  });
});

// ---------- segurança dos workflows ----------
test('workflows: o token do Supabase vem de secret, nunca escrito no arquivo', () => {
  const deploy = ler('.github/workflows/implantar-funcoes.yml');
  assert.ok(deploy.includes('secrets.SUPABASE_ACCESS_TOKEN'));
  assert.ok(!/sbp_[A-Za-z0-9]{20,}/.test(deploy), 'parece haver um token do Supabase colado no workflow');
});

test('workflow de implantação: simulação por padrão e automático só com DEPLOY_AUTOMATICO = true', () => {
  const deploy = ler('.github/workflows/implantar-funcoes.yml');
  assert.ok(/executar:[\s\S]*?default: false/.test(deploy), 'a execução manual deve ser simulação por padrão');
  assert.ok(deploy.includes("vars.DEPLOY_AUTOMATICO == 'true'"));
  assert.ok(/needs: verificar/.test(deploy), 'a implantação precisa esperar o CI');
  assert.ok(deploy.includes('uses: ./.github/workflows/ci.yml'));
});

test('workflow de implantação: dados do usuário (inputs) passam por variável de ambiente, nunca direto no comando (injeção)', () => {
  const deploy = ler('.github/workflows/implantar-funcoes.yml');
  const ofensores = [];
  // dentro de blocos "run:", ${{ inputs.* }} / github.event.* direto é perigoso (exceto comparações com literais já fixos)
  for (const bloco of deploy.split(/\n\s+run: \|?\n?/).slice(1)) {
    for (const m of bloco
      .split('\n- name')[0]
      .matchAll(/\$\{\{\s*(inputs\.funcoes|github\.event\.(?!before)[^}]*|github\.head_ref)[^}]*\}\}/g))
      ofensores.push(m[0]);
  }
  assert.deepEqual(ofensores, []);
  assert.ok(deploy.includes('PEDIDO: ${{ inputs.funcoes }}'), 'o pedido deve entrar por env');
});

test('workflows: permissões mínimas (só leitura do repositório)', () => {
  ['ci.yml', 'implantar-funcoes.yml'].forEach((f) =>
    assert.ok(/permissions:\s*\n\s*contents: read/.test(ler(`.github/workflows/${f}`)), f)
  );
});

test('CI: roda lint, formatação, sintaxe, tipos, SQL, esquema e testes — e em todo push e pull request', () => {
  const ci = ler('.github/workflows/ci.yml');
  [
    'npm run lint',
    'npm run format:check',
    'npm run check:sintaxe',
    'npm run check:tipos',
    'python scripts/validar-sql.py',
    'python scripts/verificar-esquema.py',
    'npm test',
  ].forEach((passo) => assert.ok(ci.includes(passo), `CI sem: ${passo}`));
  assert.ok(/on:\s*\n\s*push:\s*\n\s*pull_request:/.test(ci));
  assert.ok(ci.includes('workflow_call'));
  assert.ok(ci.includes('npm ci'), 'instalação reprodutível (usa o package-lock)');
});

test('package.json: os scripts que o CI chama existem, e o Node mínimo permite os testes', () => {
  const pkg = JSON.parse(ler('package.json'));
  ['lint', 'format:check', 'check:sintaxe', 'check:tipos', 'check:sql', 'check:esquema', 'test', 'verificar'].forEach(
    (s) => assert.ok(pkg.scripts[s], `script ${s} ausente`)
  );
  assert.ok(
    pkg.devDependencies.typescript,
    'typescript precisa estar declarado (o CI instala só o que está no package.json)'
  );
  assert.match(pkg.engines.node, /22/);
});

test('o package-lock.json está em dia com o package.json (npm ci falharia se não)', () => {
  const pkg = JSON.parse(ler('package.json'));
  const lock = JSON.parse(ler('package-lock.json'));
  const noLock = lock.packages[''].devDependencies || {};
  Object.entries(pkg.devDependencies).forEach(([nome, faixa]) =>
    assert.equal(noLock[nome], faixa, `${nome}: package.json diz ${faixa}, o lock diz ${noLock[nome]}`)
  );
});

test('.gitignore: node_modules e arquivos de segredo ficam fora do repositório', () => {
  const g = ler('.gitignore');
  assert.ok(/^node_modules\/$/m.test(g));
  assert.ok(/^\.env$/m.test(g));
});

// ---------- documentação em dia ----------
test('docs/CI-E-IMPLANTACAO.md lista o secret de TODA função que lê variável de ambiente', () => {
  const doc = ler('docs/CI-E-IMPLANTACAO.md');
  TODAS.forEach((n) => {
    const src = ler(`supabase/functions/${n}/index.ts`);
    const segredos = [...new Set([...src.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map((m) => m[1]))].filter(
      (s) => !s.startsWith('SUPABASE_')
    );
    segredos.forEach((s) =>
      assert.ok(doc.includes(`\`${s}\``), `docs/CI-E-IMPLANTACAO.md não lista ${s} (usado por ${n})`)
    );
    assert.ok(doc.includes(`\`${n}\``), `a documentação não cita a função ${n}`);
  });
});
