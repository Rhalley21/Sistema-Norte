// =========================================================================
// Verificador de migrações (scripts/migracoes.js): lê os SQL da pasta, pergunta ao banco quais já estão registrados e
// lista (ou, se liberado, aplica) os pendentes. Testado com uma API do Supabase SIMULADA. Garantias: simulação por
// padrão; produção só com liberação; para no primeiro erro; confere o registro; nunca imprime token nem SQL.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('../scripts/migracoes.js');

const raiz = path.join(__dirname, '..');
const TOKEN = 'sbp_TOKEN_SECRETISSIMO_123';

function pasta(arquivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const [nome, texto] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, nome), texto);
  return dir;
}
const sqlDe = (nome, extra = '') =>
  `-- ${nome}\ncreate table if not exists t_${nome.replace(/\W/g, '_')} (id int);\n${extra}\ninsert into migrations_aplicadas (arquivo) values ('${nome}') on conflict (arquivo) do nothing;\n`;
const ARQ = {
  '15-controle.sql': sqlDe('15-controle.sql'),
  '28-a.sql': sqlDe('28-a.sql'),
  '29-b.sql': sqlDe('29-b.sql'),
  '30-c.sql': sqlDe('30-c.sql'),
  '100-d.sql': sqlDe('100-d.sql'),
};

// API simulada: guarda o que foi pedido; "executar" um arquivo o registra (como o SQL real faz), salvo falha combinada.
function apiFalsa({
  aplicados = [],
  falhaEm = {},
  naoRegistra = [],
  tabelaAusente = false,
  falhaNaLeitura = false,
  dir,
}) {
  const registrados = new Set(aplicados);
  const porConteudo = new Map(fs.readdirSync(dir).map((n) => [fs.readFileSync(path.join(dir, n), 'utf8'), n]));
  const chamadas = [];
  const api = async (url, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    chamadas.push({ url, cabecalho: opcoes.headers, sql: corpo.query });
    const resp = (status, texto) => ({ ok: status < 300, status, text: async () => texto });
    if (/^select arquivo from migrations_aplicadas/.test(corpo.query)) {
      if (falhaNaLeitura) return resp(500, 'erro interno');
      if (tabelaAusente) return resp(400, '{"message":"relation \\"migrations_aplicadas\\" does not exist"}');
      return resp(200, JSON.stringify([...registrados].sort().map((arquivo) => ({ arquivo }))));
    }
    const conf = /where arquivo = \$\$(.+?)\$\$/.exec(corpo.query);
    if (conf) return resp(200, JSON.stringify(registrados.has(conf[1]) ? [{ ok: 1 }] : []));
    const nome = porConteudo.get(corpo.query);
    if (nome && falhaEm[nome]) return resp(400, falhaEm[nome]);
    if (nome && !naoRegistra.includes(nome)) registrados.add(nome);
    return resp(200, '[]');
  };
  return { api, chamadas, registrados };
}
const rodar = async (dir, extra = {}, env = {}) => {
  const logs = [];
  const f = apiFalsa({ dir, ...extra.api });
  const r = await m.executar({
    dir,
    api: f.api,
    env: { SUPABASE_ACCESS_TOKEN: TOKEN, ...env },
    ambiente: 'producao',
    executar: false,
    log: (t) => logs.push(t),
    ...extra.opcoes,
  });
  return { r, logs, ...f };
};

// ======================= os arquivos =======================
test('número do arquivo: só nomes "NN-algo.sql"', () => {
  assert.equal(m.numeroDoArquivo('28-rs-pagina-publica.sql'), 28);
  assert.equal(m.numeroDoArquivo('100-x.sql'), 100);
  for (const ruim of ['README.md', 'abc.sql', '28.sql', 'x-28-a.sql', '28-a.txt'])
    assert.equal(m.numeroDoArquivo(ruim), null, ruim);
});

test('arquivos controlados: só os que se registram com o PRÓPRIO nome; em ordem NUMÉRICA (100 depois de 30); o resto é ignorado', () => {
  const dir = pasta({
    ...ARQ,
    '29x-sem-numero-valido.sql': sqlDe('29x-sem-numero-valido.sql'),
    '31-nao-se-registra.sql': 'create table x (id int);',
    '32-registra-outro.sql': "insert into migrations_aplicadas (arquivo) values ('99-outro.sql');",
    '07-antigo.sql': 'create table antigo (id int);',
    'LEIAME.md': 'migrations_aplicadas 28-a.sql',
  });
  assert.deepEqual(
    m.arquivosGerenciados(dir).map((a) => a.nome),
    ['15-controle.sql', '28-a.sql', '29-b.sql', '30-c.sql', '100-d.sql']
  );
});

test('pendentes: os que não estão registrados, na ordem', () => {
  const g = ['15-a.sql', '28-b.sql', '29-c.sql'].map((nome) => ({ nome }));
  assert.deepEqual(
    m.pendentes(g, ['15-a.sql', '29-c.sql']).map((x) => x.nome),
    ['28-b.sql']
  );
  assert.deepEqual(
    m.pendentes(
      g,
      g.map((x) => x.nome)
    ),
    []
  );
  assert.equal(m.pendentes(g, []).length, 3);
});

test('projeto: produção usa a variável ou o padrão; teste EXIGE PROJETO_TESTE', () => {
  assert.equal(m.escolherProjeto('producao', {}).ref, m.PROJETO_PRODUCAO_PADRAO);
  assert.equal(m.escolherProjeto('producao', { PROJETO_PRODUCAO: ' abc ' }).ref, 'abc');
  assert.match(m.escolherProjeto('teste', {}).erro, /PROJETO_TESTE/);
  assert.equal(m.escolherProjeto('teste', { PROJETO_TESTE: 'xyz' }).ref, 'xyz');
  assert.notEqual(m.escolherProjeto('teste', { PROJETO_TESTE: 'xyz' }).ref, m.PROJETO_PRODUCAO_PADRAO);
});

// ======================= simulação (o padrão) =======================
test('SIMULAÇÃO: lista o que falta, em ordem, NÃO executa nada e termina com sucesso', async () => {
  const dir = pasta(ARQ);
  const { r, chamadas, logs } = await rodar(dir, { api: { aplicados: ['15-controle.sql', '28-a.sql'] } });
  assert.equal(r.codigo, 0);
  assert.deepEqual(r.pendentes, ['29-b.sql', '30-c.sql', '100-d.sql']);
  assert.deepEqual(r.aplicados, []);
  assert.match(r.mensagem, /SIMULAÇÃO: nada foi aplicado/);
  assert.equal(chamadas.length, 1, 'só leu a tabela de controle');
  assert.ok(chamadas[0].url.endsWith(`/v1/projects/${m.PROJETO_PRODUCAO_PADRAO}/database/query`));
  assert.ok(logs.some((l) => l.includes('pendente: 29-b.sql')));
});

test('nada pendente: banco em dia', async () => {
  const dir = pasta(ARQ);
  const { r } = await rodar(dir, { api: { aplicados: Object.keys(ARQ) } });
  assert.deepEqual([r.codigo, r.pendentes.length, r.mensagem], [0, 0, 'Nada pendente: o banco está em dia.']);
});

test('sem o secret do token: erro claro, sem chamar a API', async () => {
  const dir = pasta(ARQ);
  const f = apiFalsa({ dir });
  const r = await m.executar({ dir, api: f.api, env: {}, ambiente: 'producao', executar: false });
  assert.equal(r.codigo, 1);
  assert.match(r.mensagem, /SUPABASE_ACCESS_TOKEN/);
  assert.equal(f.chamadas.length, 0);
});

test('não consegue ler a tabela de controle: falha com o motivo (e nada é aplicado)', async () => {
  const dir = pasta(ARQ);
  const { r, chamadas } = await rodar(
    dir,
    { api: { falhaNaLeitura: true }, opcoes: { executar: true, ambiente: 'teste' } },
    { PROJETO_TESTE: 'proj-teste' }
  );
  assert.equal(r.codigo, 1);
  assert.match(r.mensagem, /Não consegui ler a tabela de controle/);
  assert.equal(chamadas.length, 1);
});

test('banco NOVO (tabela de controle ainda não existe): trata como "nada aplicado" e avisa que 01 a 14 vão à mão', async () => {
  const dir = pasta(ARQ);
  const { r, logs } = await rodar(dir, { api: { tabelaAusente: true } });
  assert.equal(r.codigo, 0);
  assert.equal(r.pendentes.length, 5);
  assert.ok(logs.some((l) => /banco novo/.test(l) && /01 a 14/.test(l)));
});

// ======================= aplicar de verdade =======================
test('PRODUÇÃO: aplicar de verdade é BLOQUEADO sem a liberação do GitHub; nada é executado', async () => {
  const dir = pasta(ARQ);
  const { r, chamadas } = await rodar(dir, { opcoes: { executar: true } });
  assert.equal(r.codigo, 1);
  assert.match(r.mensagem, /Bloqueado/);
  assert.match(r.mensagem, /MIGRACOES_AUTOMATICAS_PRODUCAO/);
  assert.equal(chamadas.length, 0, 'bloqueou antes de falar com o banco');
  for (const valor of ['', 'false', 'TRUE ', '1', 'sim']) {
    const x = await rodar(dir, { opcoes: { executar: true } }, { LIBERA_PRODUCAO: valor });
    assert.equal(x.r.codigo, 1, `liberação "${valor}" não vale`);
  }
});

test('PRODUÇÃO liberada: aplica os pendentes UM por vez, NA ORDEM, conferindo o registro de cada um', async () => {
  const dir = pasta(ARQ);
  const { r, chamadas, registrados } = await rodar(
    dir,
    { api: { aplicados: ['15-controle.sql'] }, opcoes: { executar: true } },
    { LIBERA_PRODUCAO: 'true' }
  );
  assert.equal(r.codigo, 0);
  assert.deepEqual(r.aplicados, ['28-a.sql', '29-b.sql', '30-c.sql', '100-d.sql']);
  assert.deepEqual([...registrados].sort(), Object.keys(ARQ).sort());
  const executados = chamadas.filter((c) => !/^select/.test(c.sql)).map((c) => c.sql.split('\n')[0]);
  assert.deepEqual(executados, ['-- 28-a.sql', '-- 29-b.sql', '-- 30-c.sql', '-- 100-d.sql']);
  assert.equal(chamadas.filter((c) => /where arquivo = \$\$/.test(c.sql)).length, 4, 'conferiu o registro de cada um');
});

test('TESTE: aplicar de verdade NÃO exige a liberação de produção, mas usa o projeto de testes (nunca o de produção)', async () => {
  const dir = pasta(ARQ);
  const { r, chamadas } = await rodar(
    dir,
    { opcoes: { executar: true, ambiente: 'teste' } },
    { PROJETO_TESTE: 'proj-teste' }
  );
  assert.equal(r.codigo, 0);
  assert.ok(chamadas.length > 1 && chamadas.every((c) => c.url.includes('/projects/proj-teste/')));
  assert.ok(!chamadas.some((c) => c.url.includes(m.PROJETO_PRODUCAO_PADRAO)));
  const sem = await rodar(dir, { opcoes: { executar: true, ambiente: 'teste' } });
  assert.equal(sem.r.codigo, 1);
  assert.match(sem.r.mensagem, /PROJETO_TESTE/);
  assert.equal(sem.chamadas.length, 0);
});

test('PARA NO PRIMEIRO ERRO: os arquivos seguintes não são aplicados e o relatório diz quais ficaram', async () => {
  const dir = pasta(ARQ);
  const { r, registrados } = await rodar(
    dir,
    { api: { falhaEm: { '29-b.sql': '{"message":"syntax error at or near x"}' } }, opcoes: { executar: true } },
    { LIBERA_PRODUCAO: 'true' }
  );
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.aplicados, ['15-controle.sql', '28-a.sql']);
  assert.deepEqual(r.pendentes, ['29-b.sql', '30-c.sql', '100-d.sql']);
  assert.match(r.mensagem, /ERRO em 29-b\.sql \(os arquivos seguintes NÃO foram aplicados\): HTTP 400: .*syntax error/);
  assert.ok(!registrados.has('30-c.sql') && !registrados.has('100-d.sql'));
});

test('se o arquivo roda mas NÃO se registra, para por segurança (não segue para o próximo)', async () => {
  const dir = pasta(ARQ);
  const { r, registrados } = await rodar(
    dir,
    { api: { naoRegistra: ['28-a.sql'] }, opcoes: { executar: true } },
    { LIBERA_PRODUCAO: 'true' }
  );
  assert.equal(r.codigo, 1);
  assert.match(r.mensagem, /28-a\.sql rodou, mas NÃO se registrou/);
  assert.ok(!registrados.has('29-b.sql'));
});

test('rodar de novo depois de aplicar não faz nada (idempotente)', async () => {
  const dir = pasta(ARQ);
  const f = apiFalsa({ dir });
  const env = { SUPABASE_ACCESS_TOKEN: TOKEN, LIBERA_PRODUCAO: 'true' };
  await m.executar({ dir, api: f.api, env, ambiente: 'producao', executar: true });
  const antes = f.chamadas.length;
  const r2 = await m.executar({ dir, api: f.api, env, ambiente: 'producao', executar: true });
  assert.equal(r2.mensagem, 'Nada pendente: o banco está em dia.');
  assert.equal(f.chamadas.length, antes + 1, 'só a leitura da tabela de controle');
});

// ======================= segredos fora do log =======================
test('NUNCA imprime o token nem o conteúdo do SQL (log, mensagem de erro e resumo); o token só vai no cabeçalho da API', async () => {
  const dir = pasta({ ...ARQ, '28-a.sql': sqlDe('28-a.sql', 'select $$SEGREDO_NO_SQL$$;') });
  const { r, logs, chamadas } = await rodar(
    dir,
    { api: { falhaEm: { '28-a.sql': '{"message":"boom"}' } }, opcoes: { executar: true } },
    { LIBERA_PRODUCAO: 'true' }
  );
  const tudo = JSON.stringify([logs, r, m.resumoMarkdown(r, 'producao', true)]);
  assert.ok(!tudo.includes(TOKEN) && !tudo.includes('SEGREDO_NO_SQL'));
  assert.ok(chamadas.every((c) => c.cabecalho.Authorization === `Bearer ${TOKEN}`));
});

test('resumo em markdown: mostra pendentes, aplicados e se foi só simulação', () => {
  const sim = m.resumoMarkdown(
    { codigo: 0, pendentes: ['34-a.sql', '38-b.sql'], aplicados: [], mensagem: 'SIMULAÇÃO: nada foi aplicado.' },
    'producao',
    false
  );
  assert.ok(
    sim.includes('ambiente: producao') &&
      sim.includes('- 34-a.sql') &&
      sim.includes('- 38-b.sql') &&
      sim.includes('Era uma simulação')
  );
  const erro = m.resumoMarkdown(
    { codigo: 1, pendentes: ['29-b.sql'], aplicados: ['28-a.sql'], mensagem: 'ERRO em 29-b.sql' },
    'teste',
    true
  );
  assert.ok(erro.includes('FALHOU') && erro.includes('Aplicados agora') && !erro.includes('Era uma simulação'));
});

// ======================= a pasta sql de verdade =======================
test('a pasta sql do projeto: do 15 em diante, todo arquivo numerado é controlado e se registra com o PRÓPRIO nome; números não se repetem', () => {
  const dir = path.join(raiz, 'sql');
  const g = m.arquivosGerenciados(dir);
  const numerados = fs.readdirSync(dir).filter((n) => m.numeroDoArquivo(n) !== null);
  assert.ok(g.length >= 28 && g[0].nome.startsWith('15-'), `controlados: ${g.length}`);
  const depoisDe15 = numerados.filter((n) => m.numeroDoArquivo(n) >= 15);
  assert.deepEqual(
    depoisDe15.filter((n) => !g.some((x) => x.nome === n)),
    [],
    'arquivo a partir do 15 que NÃO se registra sozinho (o verificador não o enxergaria)'
  );
  for (const a of g) {
    const texto = fs.readFileSync(a.caminho, 'utf8');
    const nomes = [...texto.matchAll(/insert into migrations_aplicadas[^;]*;/gi)].flatMap((s) =>
      [...s[0].matchAll(/(?:'|\$\$)(\d+-[^'$]+\.sql)(?:'|\$\$)/g)].map((x) => x[1])
    );
    assert.ok(nomes.includes(a.nome), `${a.nome} não se registra com o próprio nome`);
    if (!a.nome.startsWith('15-')) assert.deepEqual(nomes, [a.nome], `${a.nome} deve registrar só a si mesmo`);
  }
  const numeros = numerados.map(m.numeroDoArquivo);
  assert.deepEqual(
    numeros.filter((n, i) => numeros.indexOf(n) !== i),
    [],
    'número de migração repetido'
  );
});
