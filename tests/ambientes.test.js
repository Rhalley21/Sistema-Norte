// =========================================================================
// Ambientes (produção e teste): o site decide o ambiente SÓ pelo endereço (nunca por parâmetro da URL), o site de testes
// nunca fala com o banco de produção, nenhuma tela guarda mais o endereço do Supabase escrito, não há chave secreta no
// site, e os fluxos do GitHub (deploy, migrações, site de testes) têm as travas certas.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

// Roda o ambiente.js como o navegador roda, com um endereço de página e um "document" falso.
function carregar(href, documento) {
  const ctx = vm.createContext({ URL, location: { href }, document: documento, console });
  vm.runInContext(ler('ambiente.js'), ctx);
  return ctx;
}
const nome = (href) => carregar(href, undefined).NORTE_AMBIENTE.nome;

test('o ambiente é escolhido pelo ENDEREÇO do site: "teste." / "staging." no começo ou "-teste" no caminho = teste; o resto = produção', () => {
  const casos = [
    ['https://rhalley21.github.io/Sistema-Norte/app.html', 'producao'],
    ['https://rhalley21.github.io/Sistema-Norte/', 'producao'],
    ['https://sistema.inetris.com.br/app.html', 'producao'],
    ['https://www.inetris.com.br/', 'producao'],
    ['http://localhost:8080/app.html', 'producao'],
    ['https://teste.inetris.com.br/app.html', 'teste'],
    ['https://staging.inetris.com.br/', 'teste'],
    ['https://rhalley21.github.io/Sistema-Norte-teste/app.html', 'teste'],
    ['https://rhalley21.github.io/Sistema-Norte-teste', 'teste'],
  ];
  for (const [href, esperado] of casos) assert.equal(nome(href), esperado, href);
});

test('NÃO dá para trocar de ambiente por parâmetro, âncora ou texto no endereço (o site de produção nunca fala com o banco de testes)', () => {
  const casos = [
    'https://rhalley21.github.io/Sistema-Norte/?ambiente=teste',
    'https://rhalley21.github.io/Sistema-Norte/?env=teste&teste=1',
    'https://rhalley21.github.io/Sistema-Norte/#teste',
    'https://rhalley21.github.io/Sistema-Norte/teste/',
    'https://evil.com/teste.inetris.com.br/',
    'https://testeinetris.com.br/',
    'https://meu-teste.inetris.com.br/',
    'https://sistema.inetris.com.br/app.html?host=teste.inetris.com.br',
    'isso não é um endereço',
    '',
  ];
  for (const href of casos) assert.equal(nome(href), 'producao', href);
});

test('produção usa o projeto do supabase/config.toml e a chave PÚBLICA; está configurada', () => {
  const amb = plano(carregar('https://rhalley21.github.io/Sistema-Norte/', undefined).NORTE_AMBIENTE);
  const projeto = /project_id\s*=\s*"([a-z0-9]+)"/.exec(ler('supabase/config.toml'))[1];
  assert.equal(amb.supabaseUrl, `https://${projeto}.supabase.co`);
  assert.match(amb.anonKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.deepEqual([amb.nome, amb.configurado], ['producao', true]);
});

test('o ambiente de teste, enquanto não tiver projeto, vem VAZIO e "não configurado" (não fala com ninguém), e nunca herda o endereço de produção', () => {
  const t = plano(carregar('https://teste.inetris.com.br/', undefined).NORTE_AMBIENTE);
  assert.deepEqual([t.nome, t.supabaseUrl, t.anonKey, t.configurado], ['teste', '', '', false]);
  const p = plano(carregar('https://sistema.inetris.com.br/', undefined).NORTE_AMBIENTE);
  assert.notEqual(t.supabaseUrl, p.supabaseUrl);
  assert.ok(!/mgkmvrgfmuexgxkuslur/.test(JSON.stringify(t)));
});

test('o site de testes mostra uma faixa de aviso (vermelha se não configurado); produção não mostra nada', () => {
  const criaDoc = () => {
    const doc = {
      adicionados: [],
      ouvintes: {},
      body: {
        appendChild(el) {
          doc.adicionados.push(el);
        },
      },
      createElement: () => ({ style: {}, setAttribute() {}, textContent: '' }),
      addEventListener(ev, fn) {
        doc.ouvintes[ev] = fn;
      },
    };
    return doc;
  };
  const teste = criaDoc();
  carregar('https://teste.inetris.com.br/', teste);
  teste.ouvintes.DOMContentLoaded();
  assert.equal(teste.adicionados.length, 1);
  assert.match(teste.adicionados[0].textContent, /AMBIENTE DE TESTES ainda não configurado/);
  assert.match(teste.adicionados[0].style.cssText, /#b91c1c/);
  const prod = criaDoc();
  carregar('https://sistema.inetris.com.br/', prod);
  assert.deepEqual(Object.keys(prod.ouvintes), [], 'produção não adiciona faixa');
});

// ---------- as telas ----------
const TELAS = ['index.html', 'planos.html', 'vaga.html', 'video.html', 'entrega.html', 'js/01-supabase-client.js'];

test('nenhuma tela guarda mais o endereço nem a chave do Supabase escritos: todas leem de NORTE_AMBIENTE', () => {
  for (const f of TELAS) {
    const s = ler(f);
    assert.ok(
      !/mgkmvrgfmuexgxkuslur/.test(s) && !/sb_publishable_/.test(s),
      `${f} ainda tem o endereço ou a chave escritos`
    );
    assert.ok(
      /window\.NORTE_AMBIENTE\.supabaseUrl/.test(s) && /window\.NORTE_AMBIENTE\.anonKey/.test(s),
      `${f} não lê do ambiente`
    );
  }
});

test('o arquivo do ambiente é carregado ANTES do primeiro uso, em todas as telas e no app', () => {
  for (const f of TELAS.filter((x) => x.endsWith('.html'))) {
    const s = ler(f);
    const carga = s.search(/<script src="ambiente\.js(\?[^"]*)?"><\/script>/);
    assert.ok(carga >= 0, `${f} não carrega o ambiente.js`);
    assert.ok(carga < s.indexOf('window.NORTE_AMBIENTE'), `${f}: o ambiente.js vem DEPOIS do primeiro uso`);
  }
  const app = ler('app.html');
  assert.ok(app.search(/<script src="ambiente\.js\?v=[0-9.]+"><\/script>/) >= 0);
  assert.ok(app.search(/ambiente\.js/) < app.indexOf('js/01-supabase-client.js'));
});

test('o endereço de produção só aparece em lugares esperados: ambiente.js, config.toml, a função do Ponto e o padrão do deploy', () => {
  const achados = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      if (['node_modules', '.git', 'tests'].includes(e.name)) continue;
      const rel = dir === '.' ? e.name : path.join(dir, e.name);
      if (e.isDirectory()) varrer(rel);
      else if (/\.(html|js|ts|toml|yml|json)$/.test(e.name) && /mgkmvrgfmuexgxkuslur/.test(ler(rel)))
        achados.push(rel.split(path.sep).join('/'));
    }
  };
  varrer('.');
  assert.deepEqual(achados.sort(), [
    '.github/workflows/implantar-funcoes.yml',
    'ambiente.js',
    'scripts/migracoes.js',
    'supabase/config.toml',
    'supabase/functions/ponto/index.ts',
  ]);
});

test('NENHUMA chave secreta no site: sem service_role, sem sb_secret_ e sem JWT de serviço nas telas e scripts', () => {
  const arquivos = [
    ...TELAS,
    'app.html',
    'ambiente.js',
    'privacidade.html',
    'termos.html',
    'sw.js',
    ...fs.readdirSync(path.join(raiz, 'js')).map((f) => `js/${f}`),
  ];
  for (const f of new Set(arquivos)) {
    if (!fs.existsSync(path.join(raiz, f))) continue;
    const s = ler(f);
    assert.ok(
      !/service_role|sb_secret_/.test(s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
      `${f}: chave secreta no site`
    );
    assert.ok(!/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\./.test(s), `${f}: parece haver um JWT escrito no site`);
  }
});

test('as telas de vídeo e de resultado continuam sem rastreadores e só com a biblioteca de envio como script externo (o ambiente.js é do próprio site)', () => {
  for (const f of ['video.html', 'entrega.html']) {
    const externos = [...ler(f).matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(externos, ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'], f);
  }
});

// ---------- os fluxos do GitHub ----------
const wf = (n) => ler(`.github/workflows/${n}`);

test('deploy das funções: o projeto vem de variável (padrão = produção); ambiente de teste exige PROJETO_TESTE; em push é sempre produção', () => {
  const y = wf('implantar-funcoes.yml');
  assert.ok(/--project-ref "\$REF"/.test(y) && !/--project-ref "\$SUPABASE_PROJECT_REF"/.test(y));
  assert.ok(
    /PROJETO_PRODUCAO_PADRAO: mgkmvrgfmuexgxkuslur/.test(y) && /PROJETO_TESTE: \$\{\{ vars\.PROJETO_TESTE \}\}/.test(y)
  );
  assert.ok(/if \[ -z "\$REF" \]/.test(y) && /crie a variável PROJETO_TESTE/.test(y));
  assert.ok(/ambiente:[\s\S]*?options: \[producao, teste\][\s\S]*?default: producao/.test(y));
  assert.ok(/AMBIENTE:-producao/.test(y), 'sem escolha, o padrão é produção');
  assert.ok(/vars\.DEPLOY_AUTOMATICO == 'true'/.test(y), 'o automático continua exigindo a variável');
});

test('migrações: só manual, simulação por padrão, usa o secret e as variáveis certas, nunca em push', () => {
  const y = wf('migracoes.yml');
  assert.ok(/on:\s*\n\s*workflow_dispatch:/.test(y) && !/\n\s*push:/.test(y) && !/pull_request/.test(y));
  assert.ok(/executar:[\s\S]*?type: boolean[\s\S]*?default: false/.test(y));
  assert.ok(/ambiente:[\s\S]*?options: \[producao, teste\][\s\S]*?default: producao/.test(y));
  for (const v of [
    'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
    'LIBERA_PRODUCAO: ${{ vars.MIGRACOES_AUTOMATICAS_PRODUCAO }}',
    'PROJETO_TESTE: ${{ vars.PROJETO_TESTE }}',
  ])
    assert.ok(y.includes(v), v);
  assert.ok(!/set -x|echo.*SUPABASE_ACCESS_TOKEN/.test(y));
  assert.ok(/permissions:\s*\n\s*contents: read/.test(y));
});

test('site de testes: só no ramo "teste", só depois do CI, só com a variável ligada, copia só o site (sem SQL, funções, testes e docs) e não vaza o token', () => {
  const y = wf('publicar-teste.yml');
  assert.ok(/branches: \[teste\]/.test(y) && !/branches:\s*\[[^\]]*main/.test(y));
  assert.ok(/needs: verificar/.test(y) && /if: \$\{\{ vars\.PUBLICAR_TESTE == 'true' \}\}/.test(y));
  for (const pasta of ['tests', 'docs', 'sql', 'scripts', 'supabase', '.github', 'node_modules'])
    assert.ok(y.includes(`--exclude='${pasta}'`), `não exclui ${pasta}`);
  assert.ok(/TOKEN: \$\{\{ secrets\.TOKEN_REPO_TESTE \}\}/.test(y) && /REPO: \$\{\{ vars\.REPO_TESTE \}\}/.test(y));
  assert.ok(!/set -x/.test(y) && !/echo[^\n]*\$\{?TOKEN/.test(y), 'o token não pode ir para o log');
  assert.ok(
    /git push -q -f "https:\/\/x-access-token:\$\{TOKEN\}@github\.com\/\$\{REPO\}\.git" main/.test(y),
    'só empurra para o repositório de testes'
  );
});

test('o guia dos ambientes cita TODA variável e segredo que os fluxos usam', () => {
  const doc = ler('docs/AMBIENTES.md');
  const nomes = new Set();
  for (const f of fs.readdirSync(path.join(raiz, '.github/workflows')))
    for (const m of wf(f).matchAll(/(?:vars|secrets)\.([A-Z_]+)/g)) nomes.add(m[1]);
  assert.ok(nomes.size >= 6);
  for (const n of nomes) assert.ok(doc.includes(`\`${n}\``), `docs/AMBIENTES.md não explica ${n}`);
  assert.ok(
    /Supabase Pro/.test(doc) && /simulação/.test(doc) && /não foi verificado contra o Supabase de verdade/.test(doc)
  );
});
