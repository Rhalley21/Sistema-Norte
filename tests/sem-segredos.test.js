// =========================================================================
// Nenhuma chave SECRETA pode ir parar no repositório (o código do site é público
// no GitHub Pages). As chaves "publicáveis" (Supabase anon/publishable, reCAPTCHA
// de site, DSN do Sentry) são feitas pra ficar no navegador e são permitidas.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git', 'tests']); // os testes citam os padrões de propósito
const EXT = /\.(js|ts|html|json|md|toml|yml|yaml|sql|py|css)$/;
const SKIP_ARQUIVOS = new Set(['package-lock.json', '04a-data-cbo-oficial.js', '00-logo-asset.js']); // dados enormes, sem segredo

function arquivos(dir) {
  const saida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...arquivos(p));
    else if (EXT.test(e.name) && !SKIP_ARQUIVOS.has(e.name)) saida.push(p);
  }
  return saida;
}

const PADROES = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'chave da API da Anthropic'],
  [/\bre_[A-Za-z0-9]{20,}\b/, 'chave da API do Resend'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'chave secreta do Supabase (sb_secret_)'],
  [/\bsbp_[A-Za-z0-9]{30,}/, 'token de acesso pessoal do Supabase (sbp_)'],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'token do GitHub'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'chave privada'],
  [/AKIA[0-9A-Z]{16}/, 'chave de acesso da AWS'],
];

test('nenhum arquivo do projeto contém chave secreta conhecida', () => {
  const achados = [];
  for (const arq of arquivos(raiz)) {
    const texto = fs.readFileSync(arq, 'utf8');
    for (const [re, nome] of PADROES) if (re.test(texto)) achados.push(`${path.relative(raiz, arq)}: ${nome}`);
  }
  assert.deepEqual(achados, []);
});

test('nenhum JWT com papel "service_role" no código (a chave de serviço só existe no servidor)', () => {
  const achados = [];
  for (const arq of arquivos(raiz)) {
    for (const m of fs
      .readFileSync(arq, 'utf8')
      .matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
      try {
        const carga = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
        if (carga.role === 'service_role') achados.push(path.relative(raiz, arq));
      } catch (e) {
        /* não era um JWT legível */
      }
    }
  }
  assert.deepEqual(achados, []);
});

test('o scanner de segredos funciona: reconhece um padrão plantado (canário em memória)', () => {
  assert.ok(PADROES.some(([re]) => re.test('const k = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX";')));
  assert.ok(PADROES.some(([re]) => re.test('re_AbCdEfGhIjKlMnOpQrStUvWxYz123456')));
  assert.ok(
    !PADROES.some(([re]) => re.test('sb_publishable_uOz0hehVdqv_7Q2LBzVbzg_J6ZH40fh')),
    'a chave publicável deve ser permitida'
  );
});
