// =========================================================================
// Importar pessoas de uma planilha (CSV) no Recrutamento. Garantias: lê CSV de verdade (aspas, quebras de linha,
// separadores, UTF-8 e Windows-1252); mostra a prévia ANTES de criar; pula duplicadas (na planilha e já cadastradas) e
// erros; cria só "cadastradas" (sem vaga, sem e-mail ao candidato, sem banco de talentos); tudo vira texto puro.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;

function ctx(papel = 'rh') {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/44-page-processo-seletivo.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/47-rs-cadastro.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
  ]);
  c.meuPapelReal = papel;
  c.meuPerfilId = 'perfil1';
  c.URL = URL;
  c.TextDecoder = TextDecoder;
  c.Uint8Array = Uint8Array;
  c.__toasts = [];
  c.__renders = 0;
  c.__auditoria = [];
  c.__invocacoes = [];
  let n = 0;
  c.uid = () => `id${++n}`;
  c.novoCarimbo = () => ({ criadoEm: '2026-10-20T12:00:00.000Z' });
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.sb = {
    functions: { invoke: async (nome, o) => (c.__invocacoes.push({ nome, body: o.body }), { data: {}, error: null }) },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const cenario = (c, candidatos = []) =>
  rodar(
    c,
    `state.cargos = []; state.estrutura = []; state.rs = { requisicoes: [], candidatos: ${J(candidatos)}, configEtapas: {} }; _rsImportacao = { aberto: false, arquivo: '', preparo: null, erro: '' };`
  );
const prep = (c, texto, existentes = []) => plano(rodar(c, `prepararImportacaoRS(${J(texto)}, ${J(existentes)})`));
const lerCsv = (c, texto, sep) => plano(rodar(c, `lerCsvRS(${J(texto)}${sep ? `, ${J(sep)}` : ''})`));

// ======================= o CSV =======================
test('CSV simples com ";" (padrão do Excel brasileiro), CRLF, e a primeira linha é o cabeçalho', () => {
  const c = ctx();
  assert.deepEqual(lerCsv(c, 'nome;email\r\nAna;ana@x.com\r\nBia;bia@x.com\r\n'), [
    ['nome', 'email'],
    ['Ana', 'ana@x.com'],
    ['Bia', 'bia@x.com'],
  ]);
});

test('CSV: aspas, aspas duplicadas dentro de aspas, separador e quebra de linha DENTRO de aspas', () => {
  const c = ctx();
  const csv = 'nome,obs\n"Silva, Ana","disse ""olá"""\n"Bia","linha 1\nlinha 2"\n';
  assert.deepEqual(lerCsv(c, csv), [
    ['nome', 'obs'],
    ['Silva, Ana', 'disse "olá"'],
    ['Bia', 'linha 1\nlinha 2'],
  ]);
});

test('CSV: linhas vazias somem, última linha sem quebra vale, CR sozinho e LF funcionam, células vazias ficam', () => {
  const c = ctx();
  assert.deepEqual(lerCsv(c, 'a;b\n\n;\n1;\n\n2;3'), [
    ['a', 'b'],
    ['1', ''],
    ['2', '3'],
  ]);
  assert.deepEqual(lerCsv(c, 'a;b\r1;2\r3;4'), [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.deepEqual(lerCsv(c, ''), []);
  assert.deepEqual(lerCsv(c, '\n\n'), []);
});

test('separador detectado na primeira linha, fora das aspas: ";" "," ou tabulação; sem nenhum, usa ";"', () => {
  const c = ctx();
  const sep = (t) => rodar(c, `detectarSeparadorRS(${J(t)})`);
  assert.equal(sep('nome;email;telefone\nA;b;c'), ';');
  assert.equal(sep('nome,email,telefone\nA,b,c'), ',');
  assert.equal(sep('nome\temail\ttelefone'), '\t');
  assert.equal(sep('"nome, completo";email;tel'), ';', 'a vírgula dentro das aspas não conta');
  assert.equal(sep('"a;b;c;d",e,f'), ',', 'os ";" dentro das aspas não contam (fora delas só há ",")');
  assert.equal(sep('nome'), ';');
  assert.equal(sep('nome,email;telefone;origem'), ';', 'vence o mais frequente');
});

test('codificação: UTF-8 (com e sem BOM) e Windows-1252 (CSV do Excel brasileiro) saem com os acentos certos', () => {
  const c = ctx();
  const dec = (bytes) => rodar(c, `decodificarCsvRS(new Uint8Array(${J([...bytes])}))`);
  assert.equal(dec(Buffer.from('nome;origem\nJoão;Indicação', 'utf8')), 'nome;origem\nJoão;Indicação');
  assert.equal(
    dec(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('nome\nÁgata', 'utf8')])),
    'nome\nÁgata',
    'o BOM some'
  );
  const win1252 = Buffer.from(
    [...'nome;origem\nJo']
      .map((ch) => ch.charCodeAt(0))
      .concat([0xe3, 0x6f, 0x3b, 0x49, 0x6e, 0x64, 0x69, 0x63, 0x61, 0xe7, 0xe3, 0x6f])
  );
  assert.equal(dec(win1252), 'nome;origem\nJoão;Indicação');
});

// ======================= as colunas =======================
test('colunas: reconhece sinônimos, com ou sem acento e maiúscula, em qualquer ordem; ignora as desconhecidas; exige "nome"', () => {
  const c = ctx();
  const m = (cab) => plano(rodar(c, `mapearColunasRS(${J(cab)})`));
  assert.deepEqual(m(['E-mail', 'Nome Completo', 'CELULAR', 'Fonte', 'Currículo']).indices, {
    email: 0,
    nome: 1,
    telefone: 2,
    origem: 3,
    curriculo: 4,
  });
  assert.deepEqual(m(['Name', 'Mail', 'WhatsApp', 'Canal', 'Resumo']).indices, {
    nome: 0,
    email: 1,
    telefone: 2,
    origem: 3,
    curriculo: 4,
  });
  const x = m(['nome', 'Salário', 'email', 'Cidade']);
  assert.deepEqual(x.ignoradas, ['Salário', 'Cidade']);
  assert.match(m(['email', 'telefone']).erro, /coluna "nome"/);
  assert.equal(m(['nome', 'nome completo']).indices.nome, 0, 'a primeira coluna reconhecida vale');
});

// ======================= a validação =======================
test('linha válida: limpa espaços, e-mail em minúsculas, origem padrão', () => {
  const c = ctx();
  const v = (o) => plano(rodar(c, `validarLinhaImportacaoRS(${J(o)})`));
  const r = v({
    nome: '  Ana   Maria  Souza ',
    email: ' ANA@Exemplo.COM ',
    telefone: ' (11) 99999-0000 ',
    origem: '',
    curriculo: ' Vendas ',
  });
  assert.deepEqual(r.pessoa, {
    nome: 'Ana Maria Souza',
    email: 'ana@exemplo.com',
    telefone: '(11) 99999-0000',
    origem: 'Importação de planilha',
    curriculo: 'Vendas',
  });
  assert.equal(r.ok, true);
});

test('linha inválida: sem nome, nome/e-mail/telefone fora do limite ou e-mail mal formado', () => {
  const c = ctx();
  const v = (o) => plano(rodar(c, `validarLinhaImportacaoRS(${J(o)})`));
  assert.deepEqual(v({ nome: '   ' }), { ok: false, erro: 'Sem nome.' });
  assert.match(v({ nome: 'x'.repeat(121) }).erro, /Nome com mais de 120/);
  for (const ruim of ['sem-arroba', 'a@b', 'a b@c.com', 'a@b.c', '<x>@y.com', 'a@b.com,c@d.com'])
    assert.equal(v({ nome: 'Ana', email: ruim }).erro, 'E-mail inválido.', ruim);
  assert.match(v({ nome: 'Ana', telefone: '1'.repeat(31) }).erro, /Telefone com mais de 30/);
  assert.equal(v({ nome: 'x'.repeat(120) }).ok, true);
});

test('avisos: currículo longo é CORTADO em 5000; sem e-mail nem telefone avisa que não dá para saber se já está cadastrada', () => {
  const c = ctx();
  const v = (o) => plano(rodar(c, `validarLinhaImportacaoRS(${J(o)})`));
  const longo = v({ nome: 'Ana', email: 'a@b.com', curriculo: 'x'.repeat(6000) });
  assert.equal(longo.pessoa.curriculo.length, 5000);
  assert.ok(longo.avisos.some((a) => /cortado em 5000/.test(a)));
  assert.ok(v({ nome: 'Ana' }).avisos.some((a) => /Sem e-mail nem telefone/.test(a)));
  assert.ok(
    v({ nome: 'Ana', telefone: '123' }).avisos.some((a) => /Sem e-mail nem telefone/.test(a)),
    'telefone curto demais não conta'
  );
  assert.deepEqual(v({ nome: 'Ana', email: 'a@b.com' }).avisos, []);
});

test('caracteres de controle somem; texto perigoso permanece como TEXTO (fórmulas de planilha e HTML não são executados nem alterados)', () => {
  const c = ctx();
  const r = plano(
    rodar(
      c,
      `validarLinhaImportacaoRS(${J({ nome: 'An\u0000a\u0007 Souza', email: '', telefone: '=1+1', origem: '=HYPERLINK("http://x")', curriculo: '<img src=x onerror=alert(1)>' })})`
    )
  );
  assert.equal(r.pessoa.nome, 'Ana Souza');
  assert.equal(r.pessoa.telefone, '=1+1');
  assert.equal(r.pessoa.curriculo, '<img src=x onerror=alert(1)>');
});

// ======================= a prévia =======================
const CSV = [
  'Nome;E-mail;Telefone;Origem;Currículo;Salário',
  'Ana Souza;ana@x.com;(11) 91111-1111;LinkedIn;Vendas;3000',
  'Bruno Lima;bruno@x.com;;Indicação;;',
  'Ana S.;ANA@x.com;;;;', // repetida no arquivo (mesmo e-mail)
  'Carla Dias;carla@x.com;;;;', // já cadastrada
  ';sem-nome@x.com;;;;', // erro
  'Davi;e-mail-ruim;;;;', // erro
  'Eva;;(21) 92222-2222;;;', // só telefone
  'Eva Maria;;21922222222;;;', // mesma pessoa pelo telefone
  'Fábio;;;;;', // sem contato (entra, com aviso)
  'Gabi;;;;;', // sem contato (entra: não dá para comparar)
].join('\r\n');

test('prévia: cada linha com sua situação (será importada, repetida, já cadastrada, erro), números das linhas da planilha e o resumo', () => {
  const c = ctx();
  const p = prep(c, CSV, ['e:carla@x.com']);
  assert.deepEqual(
    p.linhas.map((l) => [l.linha, l.status]),
    [
      [2, 'ok'],
      [3, 'ok'],
      [4, 'duplicada_arquivo'],
      [5, 'ja_cadastrada'],
      [6, 'erro'],
      [7, 'erro'],
      [8, 'ok'],
      [9, 'duplicada_arquivo'],
      [10, 'ok'],
      [11, 'ok'],
    ]
  );
  assert.equal(p.linhas[2].duplicadaDe, 2);
  assert.equal(p.linhas[7].duplicadaDe, 8, 'a repetida pelo telefone aponta a linha original');
  assert.equal(p.linhas[4].erro, 'Sem nome.');
  assert.equal(p.linhas[5].erro, 'E-mail inválido.');
  assert.deepEqual(p.resumo, { total: 10, aptas: 5, duplicadasArquivo: 2, jaCadastradas: 1, erros: 2 });
  assert.deepEqual(p.ignoradas, ['Salário']);
  assert.ok(p.linhas[8].avisos.some((a) => /Sem e-mail nem telefone/.test(a)));
});

test('sem contato não é considerado "repetida": duas pessoas só com nome entram as duas', () => {
  const c = ctx();
  const p = prep(c, 'nome\nMaria\nMaria');
  assert.deepEqual(
    p.linhas.map((l) => l.status),
    ['ok', 'ok']
  );
});

test('erros globais: arquivo vazio, só cabeçalho, sem coluna nome, mais de 500 linhas', () => {
  const c = ctx();
  assert.match(prep(c, '').erro, /vazio/);
  assert.match(prep(c, 'nome;email').erro, /só tem o cabeçalho/);
  assert.match(prep(c, 'email;telefone\na@b.com;123').erro, /coluna "nome"/);
  const grande = ['nome;email', ...Array.from({ length: 501 }, (_, i) => `P${i};p${i}@x.com`)].join('\n');
  assert.match(prep(c, grande).erro, /501 linhas e o máximo é 500/);
  const limite = ['nome;email', ...Array.from({ length: 500 }, (_, i) => `P${i};p${i}@x.com`)].join('\n');
  assert.equal(prep(c, limite).resumo.aptas, 500, '500 linhas ainda passam');
});

test('500 linhas são processadas rápido (não trava a tela)', () => {
  const c = ctx();
  const csv = [
    'nome;email;telefone;curriculo',
    ...Array.from(
      { length: 500 },
      (_, i) => `Pessoa ${i};p${i}@x.com;11 9${String(i).padStart(7, '0')};${'texto '.repeat(200)}`
    ),
  ].join('\r\n');
  const t0 = Date.now();
  const p = prep(c, csv);
  assert.equal(p.resumo.aptas, 500);
  assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
});

test('arquivo CSV com vírgula (padrão americano) e com tabulação também funciona', () => {
  const c = ctx();
  assert.equal(prep(c, 'name,mail\nAna,ana@x.com').resumo.aptas, 1);
  assert.equal(prep(c, 'nome\temail\nAna\tana@x.com').resumo.aptas, 1);
});

test('o modelo para baixar tem BOM, ";" e as colunas certas, e a própria prévia aceita todas as linhas dele', () => {
  const c = ctx();
  const modelo = rodar(c, 'modeloCsvImportacaoRS()');
  assert.ok(modelo.startsWith('\ufeffnome;email;telefone;origem;curriculo'));
  const p = prep(c, modelo.slice(1));
  assert.deepEqual([p.resumo.total, p.resumo.aptas, p.resumo.erros], [2, 2, 0]);
});

// ======================= importar de verdade =======================
async function arquivoEscolhido(c, nome, conteudo, extra = {}) {
  const bytes = conteudo instanceof Uint8Array ? conteudo : Buffer.from(conteudo, 'utf8');
  const ev = {
    target: {
      files: [
        {
          name: nome,
          size: bytes.length,
          type: '',
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
          ...extra,
        },
      ],
      value: 'c:\\x.csv',
    },
  };
  c.__ev = ev;
  await rodar(c, '(async () => { await lerArquivoImportacaoRS(__ev); })()');
  return ev;
}
const cand = (extra) => ({
  id: 'x',
  vagaId: null,
  nome: 'Pessoa',
  email: '',
  telefone: '',
  origem: 'x',
  curriculo: '',
  etapa: null,
  reprovado: false,
  historico: [],
  criadoEm: '2026-10-01T00:00:00Z',
  ...extra,
});

test('escolher o arquivo só monta a PRÉVIA: nada é criado até confirmar; o campo de arquivo é zerado', async () => {
  const c = ctx();
  cenario(c, [cand({ id: 'a', nome: 'Carla Dias', email: 'carla@x.com' })]);
  const ev = await arquivoEscolhido(c, 'pessoas.csv', CSV);
  assert.equal(ev.target.value, '', 'permite escolher o mesmo arquivo de novo');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 1);
  assert.deepEqual(plano(rodar(c, '_rsImportacao.preparo.resumo')), {
    total: 10,
    aptas: 5,
    duplicadasArquivo: 2,
    jaCadastradas: 1,
    erros: 2,
  });
  assert.equal(rodar(c, '_rsImportacao.arquivo'), 'pessoas.csv');
  assert.equal(c.__auditoria.length, 0);
});

test('CONFIRMAR cria só as aptas como "só cadastradas" (sem vaga, sem etapa), com histórico, sem e-mail a ninguém, e audita só a quantidade', async () => {
  const c = ctx();
  cenario(c, [cand({ id: 'a', nome: 'Carla Dias', email: 'carla@x.com' })]);
  await arquivoEscolhido(c, 'pessoas.csv', CSV);
  rodar(c, 'confirmarImportacaoRS()');
  const todos = plano(rodar(c, 'state.rs.candidatos'));
  assert.equal(todos.length, 1 + 5);
  const novas = todos.slice(1);
  assert.deepEqual(
    novas.map((p) => p.nome),
    ['Ana Souza', 'Bruno Lima', 'Eva', 'Fábio', 'Gabi']
  );
  for (const p of novas) {
    assert.equal(p.vagaId, null);
    assert.equal(p.etapa, null);
    assert.equal(p.reprovado, false);
    assert.equal(p.historico[0].observacao, 'Pessoa importada de planilha');
    assert.equal(p.historico[0].autorId, 'perfil1');
  }
  assert.deepEqual(
    [novas[0].email, novas[0].telefone, novas[0].origem, novas[0].curriculo],
    ['ana@x.com', '(11) 91111-1111', 'LinkedIn', 'Vendas']
  );
  assert.equal(novas[1].origem, 'Indicação');
  assert.equal(novas[3].origem, 'Importação de planilha');
  assert.deepEqual(plano(c.__auditoria), [['rs.pessoas_importadas', { quantidade: 5 }]]);
  assert.equal(c.__invocacoes.length, 0, 'importar não manda e-mail nem chama o servidor');
  assert.ok(c.__toasts.some((t) => t.includes('5 pessoa(s) importada(s); 5 linha(s) pulada(s)')));
  assert.equal(rodar(c, '_rsImportacao.aberto'), false);
});

test('depois de importar, rodar de novo o mesmo arquivo NÃO duplica ninguém (as importadas viram "já cadastradas")', async () => {
  const c = ctx();
  cenario(c, []);
  await arquivoEscolhido(c, 'p.csv', 'nome;email\nAna;ana@x.com\nBia;bia@x.com');
  rodar(c, 'confirmarImportacaoRS()');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 2);
  await arquivoEscolhido(c, 'p.csv', 'nome;email\nAna;ana@x.com\nBia;bia@x.com\nCaio;caio@x.com');
  assert.deepEqual(plano(rodar(c, '_rsImportacao.preparo.resumo')), {
    total: 3,
    aptas: 1,
    duplicadasArquivo: 0,
    jaCadastradas: 2,
    erros: 0,
  });
  rodar(c, 'confirmarImportacaoRS()');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 3);
});

test('uma pessoa que já está em processo seletivo também conta como "já cadastrada" (mesmo e-mail)', async () => {
  const c = ctx();
  cenario(c, [cand({ id: 'a', nome: 'Ana', email: 'ana@x.com', vagaId: 'v1', etapa: 'triagem' })]);
  await arquivoEscolhido(c, 'p.csv', 'nome;email\nAna Souza;ana@x.com');
  assert.equal(rodar(c, '_rsImportacao.preparo.resumo.jaCadastradas'), 1);
});

test('recusas antes de ler: arquivo do Excel (.xlsx), tipo estranho, grande demais e vazio; a mensagem orienta o que fazer', async () => {
  const c = ctx();
  cenario(c, []);
  await arquivoEscolhido(c, 'lista.xlsx', 'x');
  assert.match(rodar(c, '_rsImportacao.erro'), /Salvar como > CSV/);
  await arquivoEscolhido(c, 'foto.png', 'x');
  assert.match(rodar(c, '_rsImportacao.erro'), /Envie um arquivo CSV/);
  await arquivoEscolhido(c, 'grande.csv', 'x', { size: 2 * 1048576 });
  assert.match(rodar(c, '_rsImportacao.erro'), /mais de 1 MB/);
  await arquivoEscolhido(c, 'vazio.csv', '', { size: 0 });
  assert.match(rodar(c, '_rsImportacao.erro'), /vazio/);
  await arquivoEscolhido(c, 'ruim.csv', 'email;telefone\na@b.com;1');
  assert.match(rodar(c, '_rsImportacao.erro'), /coluna "nome"/);
  assert.equal(rodar(c, '_rsImportacao.preparo'), null);
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0);
});

test('confirmar sem nenhuma linha apta não cria nada e avisa', async () => {
  const c = ctx();
  cenario(c, []);
  await arquivoEscolhido(c, 'p.csv', 'nome;email\n;a@b.com\nAna;ruim');
  rodar(c, 'confirmarImportacaoRS()');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0);
  assert.ok(c.__toasts.includes('Nenhuma pessoa apta para importar.'));
  rodar(c, '_rsImportacao = { aberto: true, arquivo: "", preparo: null, erro: "" }; confirmarImportacaoRS();');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0, 'sem prévia não faz nada');
});

// ======================= a tela =======================
test('o painel só aparece aberto; mostra as instruções, a prévia (20 linhas), os totais e o botão com a quantidade', async () => {
  const c = ctx();
  cenario(c, []);
  assert.equal(rodar(c, 'importacaoPainelHtml()'), '');
  rodar(c, '_rsImportacao.aberto = true');
  let h = rodar(c, 'importacaoPainelHtml()');
  assert.ok(
    h.includes('modelo de planilha (CSV)') &&
      h.includes('type="file"') &&
      h.includes('500 linhas') &&
      h.includes('1 MB') &&
      h.includes('só cadastradas')
  );
  const csv = ['nome;email', ...Array.from({ length: 30 }, (_, i) => `Pessoa ${i};p${i}@x.com`)].join('\n');
  await arquivoEscolhido(c, 'p.csv', csv);
  h = rodar(c, 'importacaoPainelHtml()');
  assert.ok(h.includes('<b>p.csv</b>: 30 linha(s) — <b>30</b> serão importadas'));
  assert.equal((h.match(/Será importada/g) || []).length, 20);
  assert.ok(
    h.includes('Mostrando as 20 primeiras linhas de 30') &&
      h.includes('Importar 30 pessoa(s)') &&
      !h.includes('type="file"')
  );
  await arquivoEscolhido(c, 'p.csv', 'nome;email\n;a@b.com');
  assert.ok(rodar(c, 'importacaoPainelHtml()').includes('disabled'), 'sem aptas o botão de importar fica desligado');
});

test('na prévia, nomes e células com HTML saem como TEXTO (sem injeção)', async () => {
  const c = ctx();
  cenario(c, []);
  await arquivoEscolhido(
    c,
    'p.csv',
    'nome;email;curriculo;Coluna <b>x</b>\n<img src=x onerror=alert(1)>;a@b.com;<script>x</script>;1'
  );
  const h = rodar(c, 'importacaoPainelHtml()');
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>') && !h.includes('<b>x</b>'));
  assert.ok(h.includes('&lt;img'));
});

test('o Recrutamento mostra o botão "Importar planilha" e o painel; só Administrador e RH', () => {
  const c = ctx('rh');
  cenario(c, []);
  assert.ok(rodar(c, 'pageRS()').includes('Importar planilha') && !rodar(c, 'pageRS()').includes('modelo de planilha'));
  rodar(c, 'abrirImportacaoRS()');
  assert.ok(
    rodar(c, 'pageRS()').includes('modelo de planilha (CSV)') && rodar(c, 'pageRS()').includes('Fechar importação')
  );
  const lider = ctx('lider');
  cenario(lider, []);
  assert.ok(!rodar(lider, 'pageRS()').includes('Importar planilha'));
});

test('baixar o modelo gera um arquivo CSV com o nome certo', () => {
  const c = ctx();
  c.setTimeout = setTimeout;
  const baixados = [];
  c.Blob = function (partes, opcoes) {
    this.partes = partes;
    this.opcoes = opcoes;
  };
  c.URL = { createObjectURL: (b) => (baixados.push(b), 'blob:x'), revokeObjectURL() {} };
  c.document.createElement = () => ({
    click() {
      baixados.push('clicou');
    },
    remove() {},
    set href(v) {},
    set download(v) {
      baixados.push(v);
    },
  });
  c.document.body = { appendChild() {} };
  rodar(c, 'baixarModeloImportacaoRS()');
  assert.ok(baixados.includes('modelo-importacao-pessoas.csv') && baixados.includes('clicou'));
  assert.ok(baixados[0].partes[0].startsWith('\ufeffnome;email'));
  assert.equal(baixados[0].opcoes.type, 'text/csv;charset=utf-8');
});

test('integração: o script está no app, o painel está no Recrutamento e a importação não manda e-mail nem fala com o servidor', () => {
  assert.ok(ler('app.html').includes('js/50-rs-importacao.js'));
  assert.ok(
    ler('js/47-rs-cadastro.js').includes('${importacaoPainelHtml()}') &&
      ler('js/47-rs-cadastro.js').includes('abrirImportacaoRS()')
  );
  const js = ler('js/50-rs-importacao.js');
  assert.ok(!/enviarEmailEtapaRS|sb\.functions|fetch\(/.test(js));
});
