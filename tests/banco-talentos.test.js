// =========================================================================
// Banco de talentos: candidatos que AUTORIZARAM ficar disponíveis para futuras
// vagas. Testa o agrupamento por pessoa e a expiração no servidor, os filtros no
// navegador e — importante pra LGPD — que o prazo prometido ao candidato é o
// mesmo no formulário, na Política de Privacidade e no servidor.
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
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

function servidor() {
  const origem = ler('supabase/functions/rs/index.ts');
  const ini = origem.indexOf('// ---- Banco de talentos');
  const fim = origem.indexOf('// ---- fim: banco de talentos');
  assert.ok(ini >= 0 && fim > ini);
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Map, Set, RegExp });
  vm.runInContext(
    nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)) +
      '\nthis.__prazo = BANCO_TALENTOS_MESES; this.__uuid = UUID_RE;',
    ctx
  );
  return ctx;
}

// ---------- servidor ----------
test('mesesAtras/mesesDepois: somam e subtraem meses no calendário (UTC)', opcoes, () => {
  const c = servidor();
  assert.equal(c.mesesDepois('2026-01-15T12:00:00.000Z', 24), '2028-01-15T12:00:00.000Z');
  assert.equal(c.mesesAtras(Date.parse('2026-10-05T12:00:00.000Z'), 24), '2024-10-05T12:00:00.000Z');
  assert.equal(c.mesesAtras(Date.parse('2026-03-10T00:00:00.000Z'), 1), '2026-02-10T00:00:00.000Z');
});

test('agruparTalentos: a mesma pessoa em várias vagas vira UMA entrada, com os dados mais recentes', opcoes, () => {
  const c = servidor();
  const g = plano(
    c.agruparTalentos([
      {
        id: 'a',
        candidatura_id: 'c1',
        nome: 'Maria Souza',
        email: 'Maria@x.com',
        telefone: null,
        curriculo_path: 'e/v/1.pdf',
        criado_em: '2026-01-10T10:00:00Z',
      },
      {
        id: 'b',
        candidatura_id: 'c2',
        nome: 'Maria S. Souza',
        email: ' maria@x.com ',
        telefone: '8999',
        curriculo_path: null,
        criado_em: '2026-06-01T10:00:00Z',
      },
      {
        id: 'c',
        candidatura_id: 'c3',
        nome: 'João',
        email: 'joao@x.com',
        telefone: null,
        curriculo_path: null,
        criado_em: '2026-03-01T10:00:00Z',
      },
    ])
  );
  assert.equal(g.length, 2);
  const maria = g.find((x) => x.chave === 'maria@x.com');
  assert.deepEqual(maria.ids, ['b', 'a']); // mais recente primeiro
  assert.equal(maria.nome, 'Maria S. Souza'); // dado mais recente
  assert.equal(maria.telefone, '8999'); // pega o telefone mesmo vindo de outra candidatura
  assert.equal(maria.idCurriculo, 'a'); // o currículo mais recente que existe
  assert.equal(maria.entrouEm, '2026-06-01T10:00:00Z'); // o prazo conta da autorização mais recente
  assert.deepEqual(maria.candidaturaIds, ['c2', 'c1']);
});

test('agruparTalentos: ordena do mais recente pro mais antigo e ignora linha sem e-mail', opcoes, () => {
  const c = servidor();
  const g = plano(
    c.agruparTalentos([
      {
        id: '1',
        candidatura_id: null,
        nome: 'A',
        email: 'a@x.com',
        telefone: null,
        curriculo_path: null,
        criado_em: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        candidatura_id: null,
        nome: 'B',
        email: 'b@x.com',
        telefone: null,
        curriculo_path: null,
        criado_em: '2026-05-01T00:00:00Z',
      },
      {
        id: '3',
        candidatura_id: null,
        nome: 'sem',
        email: '   ',
        telefone: null,
        curriculo_path: null,
        criado_em: '2026-09-01T00:00:00Z',
      },
    ])
  );
  assert.deepEqual(
    g.map((x) => x.nome),
    ['B', 'A']
  );
  assert.deepEqual(plano(c.agruparTalentos([])), []);
});

test('UUID_RE: só aceita UUID de verdade (o id do talento vem do navegador)', opcoes, () => {
  const c = servidor();
  assert.equal(c.__uuid.test('3f2b8c1e-9a4d-4e1b-8c7a-1d2e3f4a5b6c'), true);
  ['', 'abc', "1' or '1'='1", '../../x', '3f2b8c1e-9a4d-4e1b-8c7a-1d2e3f4a5b6cX'].forEach((x) =>
    assert.equal(c.__uuid.test(x), false, x)
  );
});

test('rs: o servidor expira, nunca devolve o caminho do arquivo e exige Administrador/RH (regressão)', () => {
  const o = ler('supabase/functions/rs/index.ts');
  assert.ok(
    o.includes(".lt('criado_em', mesesAtras(Date.now(), BANCO_TALENTOS_MESES))"),
    'a listagem precisa apagar quem passou do prazo'
  );
  const bloco = o.slice(
    o.indexOf("if (action === 'listar_banco_talentos')"),
    o.indexOf("if (action === 'curriculo_talento')")
  );
  assert.ok(
    !/curriculo_path:\s*[a-z]/.test(bloco.slice(bloco.indexOf('const talentos'))),
    'não devolver o caminho do arquivo ao navegador'
  );
  assert.ok(
    o.indexOf("['owner', 'rh'].includes(perfil.papel)") < o.indexOf("if (action === 'listar_banco_talentos')"),
    'a checagem de papel precisa vir antes das ações do banco'
  );
  assert.ok(o.includes(".eq('empresa_id', perfil.empresa_id)"));
});

// ---------- consentimento: o MESMO prazo nos três lugares ----------
test(
  'LGPD: o prazo do banco de talentos é o mesmo no servidor, no formulário e na Política de Privacidade',
  opcoes,
  () => {
    const meses = servidor().__prazo;
    assert.equal(typeof meses, 'number');
    assert.ok(ler('vaga.html').includes(`por até ${meses} meses`), 'o formulário público diz outro prazo');
    assert.ok(ler('privacidade.html').includes(`${meses} meses`), 'a Política de Privacidade diz outro prazo');
    assert.ok(
      ler('supabase/functions/assistente-ajuda/index.ts').includes(`até ${meses} meses`),
      'a base do assistente diz outro prazo'
    );
    assert.ok(ler('js/41-page-central-ajuda.js').includes(`até ${meses} meses`), 'o FAQ diz outro prazo');
  }
);

// ---------- navegador ----------
const cli = carregarArquivos(['js/43-page-banco-talentos.js']);
const TALENTOS = [
  {
    chave: 'a@x.com',
    nome: 'Ana Lima',
    email: 'a@x.com',
    telefone: '8999',
    vagaTitulo: 'Vendedor',
    perfil: {
      cidadeAtual: 'Teresina',
      formacaoSuperior: 'completo',
      disponibilidadeHorarios: 'flexivel',
      possuiMoto: true,
      possuiNotebook: false,
    },
  },
  {
    chave: 'b@x.com',
    nome: 'Bruno Costa',
    email: 'b@x.com',
    telefone: null,
    vagaTitulo: 'Caixa',
    perfil: {
      cidadeAtual: 'Parnaíba',
      formacaoSuperior: 'cursando',
      disponibilidadeHorarios: 'comercial',
      possuiNotebook: true,
      experienciaAnteriorFuncao: 'Atendimento em loja de roupas',
    },
  },
  { chave: 'c@x.com', nome: 'Carla Dias', email: 'c@x.com', telefone: null, vagaTitulo: null, perfil: {} },
];
const nomes = (f) => plano(cli.talentosFiltrar(TALENTOS, f)).map((t) => t.nome);

test('talentosFiltrar: sem filtro devolve todos; busca ignora acento e maiúsculas e exige todas as palavras', () => {
  assert.equal(nomes({}).length, 3);
  assert.deepEqual(nomes({ busca: 'TERESINA' }), ['Ana Lima']);
  assert.deepEqual(nomes({ busca: 'parnaiba loja' }), ['Bruno Costa']);
  assert.deepEqual(nomes({ busca: 'vendedor' }), ['Ana Lima']); // vaga de origem
  assert.deepEqual(nomes({ busca: 'parnaiba vendedor' }), []); // todas as palavras
});

test('talentosFiltrar: selects e caixas refinam; perfil vazio não quebra', () => {
  assert.deepEqual(nomes({ formacao: 'completo' }), ['Ana Lima']);
  assert.deepEqual(nomes({ disponibilidade: 'comercial' }), ['Bruno Costa']);
  assert.deepEqual(nomes({ moto: true }), ['Ana Lima']);
  assert.deepEqual(nomes({ notebook: true }), ['Bruno Costa']);
  assert.deepEqual(nomes({ moto: true, notebook: true }), []);
  assert.deepEqual(plano(cli.talentosFiltrar(null, null)), []);
});

test('talentoDiasParaExpirar: conta os dias até sair do banco', () => {
  const agora = new Date('2026-10-05T12:00:00Z');
  assert.equal(cli.talentoDiasParaExpirar('2026-10-15T12:00:00Z', agora), 10);
  assert.equal(cli.talentoDiasParaExpirar('2026-10-05T12:00:00Z', agora), 0);
  assert.ok(cli.talentoDiasParaExpirar('2026-10-01T12:00:00Z', agora) < 0);
});

test('a tela do banco de talentos escapa todo texto vindo de candidato (regressão de XSS)', () => {
  const src = ler('js/43-page-banco-talentos.js');
  const ofensores = [];
  src.split('\n').forEach((linha, i) => {
    if (/confirm\(|showToast\(/.test(linha)) return; // texto puro (caixa do navegador), não HTML
    for (const m of linha.matchAll(
      /\$\{\s*(t\.(?:nome|email|telefone|vagaTitulo)|p\.(?:cidadeAtual|linkedin|experienciaAnteriorFuncao))\s*\}/g
    ))
      ofensores.push(`${i + 1}: ${m[0]}`);
  });
  assert.deepEqual(ofensores, [], 'campo de candidato sem escaparHtml()');
});
