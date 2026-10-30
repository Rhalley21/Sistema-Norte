// =========================================================================
// Verificador da matriz de segurança (scripts/matriz-rls.py): o repositório está em ordem, o documento gerado está em dia,
// uma política nova de escrita sem controle de papel FAZ O CI FALHAR, e o que o verificador lê dos arquivos SQL é
// exatamente o que o Postgres de verdade tem depois de aplicar as migrações.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('node:child_process');
const { criarBancoReal } = require('./helpers/banco-real.js');

const raiz = path.join(__dirname, '..');
const script = path.join(raiz, 'scripts', 'matriz-rls.py');
const rodarPy = (args, cwd = raiz) => spawnSync('python3', [script, ...args], { cwd, encoding: 'utf8' });

test('o repositório passa no verificador: nenhuma política de escrita sem controle de papel fora das exceções documentadas', () => {
  const r = rodarPy(['--check']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nenhuma escrita sem controle de papel/);
});

test('docs/MATRIZ-RLS.md está EM DIA com os arquivos SQL (se não estiver, rode: python3 scripts/matriz-rls.py > docs/MATRIZ-RLS.md)', () => {
  const gerado = rodarPy([]).stdout.trim();
  const arquivo = fs.readFileSync(path.join(raiz, 'docs', 'MATRIZ-RLS.md'), 'utf8').trim();
  assert.equal(arquivo, gerado);
});

test('uma migração NOVA que abra de novo a escrita (como era o documento da empresa e os convites) FAZ O VERIFICADOR FALHAR', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matriz-'));
  fs.cpSync(path.join(raiz, 'sql'), path.join(tmp, 'sql'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'sql', '99-ruim.sql'),
    'create policy ruim_dados on dados_sistema for all using (empresa_id = empresa_do_usuario());\ncreate policy ruim_convites on convites for insert with check (empresa_id = empresa_do_usuario());\n'
  );
  const r = rodarPy(['--check'], tmp);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /dados_sistema: "ruim_dados" \(all\) em 99-ruim\.sql/);
  assert.match(r.stdout, /convites: "ruim_convites" \(insert\) em 99-ruim\.sql/);
});

test('uma política nova que EXIGE o papel passa; remover uma política (drop) a tira da matriz', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matriz-'));
  fs.cpSync(path.join(raiz, 'sql'), path.join(tmp, 'sql'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'sql', '99-boa.sql'),
    "create policy boa_escrita on dados_sistema for update using (empresa_id = empresa_do_usuario() and meu_papel() in ('owner'));\n"
  );
  assert.equal(rodarPy(['--check'], tmp).status, 0);
  fs.writeFileSync(
    path.join(tmp, 'sql', '99-boa.sql'),
    'create policy ruim on dados_sistema for all using (true);\ndrop policy ruim on dados_sistema;\n'
  );
  assert.equal(rodarPy(['--check'], tmp).status, 0, 'a política ruim foi removida na mesma migração');
});

test('as tabelas de uso exclusivo do servidor (sem permissão para a API) e as antigas substituídas pelo documento aparecem como "só servidor"', () => {
  const md = rodarPy([]).stdout;
  for (const t of [
    'rs_videos',
    'rs_entregas',
    'seguranca_log',
    'colaboradores',
    'cargos',
    'culturas',
    'avaliacoes',
    'banco_acoes',
  ])
    assert.match(md, new RegExp(`\\| \`${t}\` \\| \\*\\*só servidor\\*\\*`), t);
  assert.ok(!/RLS DESLIGADO/.test(md), 'nenhuma tabela com RLS desligado');
});

test('CONFERÊNCIA COM O BANCO REAL: as políticas que o verificador lê dos arquivos SQL são exatamente as que o Postgres tem (convites, documento, perfis e empresas)', async () => {
  const lidas = JSON.parse(execFileSync('python3', [script, '--json'], { cwd: raiz, encoding: 'utf8' }));
  const b = await criarBancoReal({ com45: true });
  for (const tabela of ['convites', 'dados_sistema', 'perfis', 'empresas']) {
    const reais = (
      await b.ver(
        `select policyname from pg_policies where schemaname = 'public' and tablename = '${tabela}' order by policyname`
      )
    ).map((x) => x.policyname);
    assert.deepEqual([...lidas[tabela]].sort(), reais.sort(), `${tabela}: o verificador e o Postgres discordam`);
  }
});

test('uma tabela APAGADA (drop table) sai da matriz: as das provas retiradas não aparecem mais como se existissem', () => {
  const md = rodarPy([]).stdout;
  assert.ok(!md.includes('rs_provas'), 'rs_provas e rs_provas_aplicacoes foram apagadas na migração 41');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matriz-'));
  fs.cpSync(path.join(raiz, 'sql'), path.join(tmp, 'sql'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'sql', '99-tabela-efemera.sql'),
    'create table efemera (id int);\nalter table efemera enable row level security;\ncreate policy efemera_ruim on efemera for all using (true);\n'
  );
  const antes = rodarPy(['--check'], tmp);
  assert.equal(antes.status, 1, 'enquanto a tabela existe, a regra aberta é apontada');
  assert.match(antes.stdout, /efemera: "efemera_ruim"/);
  fs.writeFileSync(path.join(tmp, 'sql', '100-tabela-efemera-fim.sql'), 'drop table if exists efemera;\n');
  const depois = rodarPy(['--check'], tmp);
  assert.equal(depois.status, 0, 'depois de apagar a tabela não há mais o que apontar');
  assert.ok(!rodarPy([], tmp).stdout.includes('efemera'));
});
