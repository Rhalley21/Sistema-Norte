// =========================================================================
// Etapas do processo seletivo (R&S): o funil segue as etapas que a empresa definiu, cada vaga escolhe
// quais usa, candidatos do funil antigo são movidos sem perder nada, e as etapas INTERNAS (redes sociais,
// checagem do currículo) nunca mandam e-mail ao candidato.
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

function ctx() {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
  ]);
  c.__toasts = [];
  c.__renders = 0;
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.document.querySelectorAll = () => [];
  c.URL = URL; // o navegador tem URL; a caixa de areia do teste não
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);

// ======================= o catálogo =======================
test('as etapas seguem EXATAMENTE a ordem e os nomes que a empresa definiu', () => {
  const c = ctx();
  const lista = plano(rodar(c, 'ETAPAS_RS'));
  assert.deepEqual(
    lista.map((e) => e.nome),
    [
      'Nova candidatura',
      'Triagem dos currículos',
      'Teste DISC e GALT',
      'Vídeo de apresentação',
      'Verificação nas redes sociais',
      'Checagem de informações do currículo',
      'Entrevista de fit cultural',
      'Teste lógico',
      'Prova teórica',
      'Prova prática',
      'Entrevista final',
      'Escolha do candidato',
      'Proposta',
      'Aprovado',
    ]
  );
});

test('as etapas do funil antigo apontam todas para uma etapa que existe, e seus nomes continuam legíveis no histórico', () => {
  const c = ctx();
  const ids = plano(rodar(c, 'ETAPAS_RS')).map((e) => e.id);
  const mapa = plano(rodar(c, 'ETAPAS_LEGADAS_RS'));
  assert.deepEqual(Object.keys(mapa).sort(), ['avaliacao', 'contato_inicial', 'entrevista', 'finalista']);
  Object.values(mapa).forEach((novo) => assert.ok(ids.includes(novo), novo));
  assert.equal(rodar(c, "etapaNomeRS('contato_inicial')"), 'Contato inicial');
  assert.equal(rodar(c, "etapaNomeRS('finalista')"), 'Finalista');
  assert.equal(rodar(c, "etapaNomeRS('reprovado')"), 'Reprovado');
  assert.equal(rodar(c, "etapaNomeRS('video')"), 'Vídeo de apresentação');
  assert.equal(rodar(c, "etapaNomeRS('algo-desconhecido')"), 'algo-desconhecido');
});

// ======================= etapas por vaga =======================
test('vaga sem escolha registrada (as antigas) usa TODAS as etapas', () => {
  const c = ctx();
  const todas = plano(rodar(c, 'ETAPAS_RS')).map((e) => e.id);
  assert.deepEqual(
    plano(rodar(c, 'etapasAtivasDaVagaRS({})')).map((e) => e.id),
    todas
  );
  assert.deepEqual(
    plano(rodar(c, 'etapasAtivasDaVagaRS(null)')).map((e) => e.id),
    todas
  );
  assert.deepEqual(
    plano(rodar(c, 'etapasAtivasDaVagaRS({ etapasAtivas: "texto" })')).map((e) => e.id),
    todas
  );
});

test('vaga com escolha: as fixas sempre valem, as marcadas entram e a ordem é a do processo', () => {
  const c = ctx();
  const ids = (v) => plano(rodar(c, `etapasAtivasDaVagaRS(${JSON.stringify(v)})`)).map((e) => e.id);
  assert.deepEqual(ids({ etapasAtivas: ['triagem', 'entrevista_final'] }), [
    'nova',
    'triagem',
    'entrevista_final',
    'proposta',
    'aprovado',
  ]);
  assert.deepEqual(
    ids({ etapasAtivas: ['entrevista_final', 'triagem'] }),
    ['nova', 'triagem', 'entrevista_final', 'proposta', 'aprovado'],
    'a ordem não depende da ordem em que foi marcada'
  );
  assert.deepEqual(
    ids({ etapasAtivas: [] }),
    ['nova', 'proposta', 'aprovado'],
    'vaga que desligou tudo ainda funciona'
  );
  assert.deepEqual(ids({ etapasAtivas: ['inventada'] }), ['nova', 'proposta', 'aprovado']);
});

test('etapasMarcadasRS: só ids válidos e opcionais, sem repetir, em ordem — o que vem da tela nunca é confiável', () => {
  const c = ctx();
  const m = (x) => plano(rodar(c, `etapasMarcadasRS(${JSON.stringify(x)})`));
  assert.deepEqual(m(['video', 'triagem', 'video', 'xyz', '<script>', 'nova', 'aprovado']), ['triagem', 'video']);
  assert.deepEqual(m(null), []);
  assert.deepEqual(m('triagem'), []);
  assert.deepEqual(m([1, 2]), []);
  assert.equal(m(plano(rodar(c, 'etapasOpcionaisRS().map((e) => e.id)'))).length, 11);
});

test('o seletor de etapa do candidato mostra as da vaga + a etapa em que ele já está, mesmo que a vaga a tenha desligado', () => {
  const c = ctx();
  const sel = (v, cand) =>
    plano(rodar(c, `etapasParaSelecaoRS(${JSON.stringify(v)}, ${JSON.stringify(cand)})`)).map((e) => e.id);
  const vaga = { etapasAtivas: ['triagem', 'entrevista_final'] };
  assert.deepEqual(sel(vaga, { etapa: 'triagem' }), ['nova', 'triagem', 'entrevista_final', 'proposta', 'aprovado']);
  assert.deepEqual(
    sel(vaga, { etapa: 'video' }),
    ['nova', 'triagem', 'video', 'entrevista_final', 'proposta', 'aprovado'],
    'a etapa atual aparece (e sem repetir)'
  );
  assert.equal(new Set(sel(vaga, { etapa: 'video' })).size, sel(vaga, { etapa: 'video' }).length);
});

// ======================= migração do funil antigo =======================
test('candidatos do funil antigo vão pra etapa equivalente, com uma linha no histórico — e nada mais muda', () => {
  const c = ctx();
  const cands = [
    { id: 'a', etapa: 'contato_inicial', reprovado: false, historico: [{ de: null, para: 'nova' }] },
    { id: 'b', etapa: 'avaliacao', historico: [] },
    { id: 'c', etapa: 'entrevista', reprovado: true, historico: [] },
    { id: 'd', etapa: 'finalista' }, // sem histórico
    { id: 'e', etapa: 'triagem', historico: [] }, // já é do funil novo
    { id: 'f', etapa: 'aprovado', historico: [] },
    { id: 'g', etapa: 'etapa-estranha', historico: [] },
  ];
  const n = rodar(
    c,
    `(() => { globalThis.__cands = ${JSON.stringify(cands)}; return migrarEtapasLegadasRS(__cands, 'perfil1'); })()`
  );
  assert.equal(n, 4);
  const r = plano(rodar(c, '__cands'));
  assert.deepEqual(
    r.map((x) => x.etapa),
    ['triagem', 'disc_galt', 'entrevista_fit', 'escolha', 'triagem', 'aprovado', 'etapa-estranha']
  );
  assert.equal(r[0].historico.at(-1).de, 'contato_inicial');
  assert.equal(r[0].historico.at(-1).para, 'triagem');
  assert.equal(r[0].historico.at(-1).autorId, 'perfil1');
  assert.match(r[0].historico.at(-1).observacao, /automaticamente/);
  assert.equal(r[0].historico.length, 2, 'o histórico anterior foi preservado');
  assert.equal(r[2].reprovado, true, 'a reprovação não muda');
  assert.equal(r[3].historico.length, 1, 'quem não tinha histórico ganha um');
  assert.equal(r[4].historico.length, 0);
});

test('a migração é idempotente (rodar de novo não move nem duplica o histórico) e aguenta lista vazia ou nula', () => {
  const c = ctx();
  rodar(c, "globalThis.__c2 = [{ id: 'a', etapa: 'avaliacao', historico: [] }];");
  assert.equal(rodar(c, "migrarEtapasLegadasRS(__c2, 'p')"), 1);
  assert.equal(rodar(c, "migrarEtapasLegadasRS(__c2, 'p')"), 0);
  assert.equal(rodar(c, '__c2[0].historico.length'), 1);
  assert.equal(rodar(c, 'migrarEtapasLegadasRS([], null)'), 0);
  assert.equal(rodar(c, 'migrarEtapasLegadasRS(null, null)'), 0);
});

test('abrir a tela de R&S (garantirRS) migra os candidatos antigos sozinho', () => {
  const c = ctx();
  rodar(
    c,
    "state.rs = { requisicoes: [], candidatos: [{ id: 'x', etapa: 'finalista', historico: [] }] }; garantirRS();"
  );
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'escolha');
});

// ======================= e-mails ao candidato =======================
test('e-mail ao candidato: toda etapa com contato tem texto; as INTERNAS (redes sociais e checagem) NUNCA mandam e-mail', () => {
  const c = ctx();
  const modelos = Object.keys(
    plano(rodar(c, 'Object.fromEntries(Object.entries(RS_EMAIL_POR_ETAPA).map(([k, v]) => [k, v.assunto]))'))
  );
  const etapas = plano(rodar(c, 'ETAPAS_RS'));
  for (const e of etapas) {
    if (e.interna) assert.ok(!modelos.includes(e.id), `a etapa interna ${e.id} não pode ter e-mail ao candidato`);
    else assert.ok(modelos.includes(e.id), `a etapa ${e.id} está sem e-mail ao candidato`);
  }
  assert.ok(modelos.includes('reprovado'));
});

test('e-mail ao candidato: manda nas etapas visíveis (com nome e vaga escapados), não manda nas internas nem sem e-mail', async () => {
  const c = ctx();
  const enviados = [];
  c.sb = { functions: { invoke: async (nome, o) => (enviados.push(o.body), { data: {}, error: null }) } };
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Analista <b>X</b>' }]; state.rs = { requisicoes: [{ id: 'v1', cargoId: 'cg', codigo: 'REQ-001' }], candidatos: [] };`
  );
  const cand = { nome: 'Ana <img src=x>', email: 'ana@x.com', vagaId: 'v1' };
  await rodar(c, `enviarEmailEtapaRS(${JSON.stringify(cand)}, 'video')`);
  await rodar(c, `enviarEmailEtapaRS(${JSON.stringify(cand)}, 'redes_sociais')`);
  await rodar(c, `enviarEmailEtapaRS(${JSON.stringify(cand)}, 'checagem_curriculo')`);
  await rodar(c, `enviarEmailEtapaRS(${JSON.stringify({ ...cand, email: '' })}, 'video')`);
  assert.equal(enviados.length, 1, 'só a etapa visível, com e-mail cadastrado');
  assert.equal(enviados[0].destinatario, 'ana@x.com');
  assert.ok(enviados[0].assunto.includes('vídeo'));
  assert.ok(
    !enviados[0].corpoHtml.includes('<img') && !enviados[0].corpoHtml.includes('<b>X</b>'),
    'nome e vaga precisam sair escapados'
  );
});

// ======================= tela: escolha das etapas =======================
test('checkboxes: sem escolha todas ligadas; com escolha só as marcadas; nome das internas avisa que não manda e-mail', () => {
  const c = ctx();
  const todas = rodar(c, "etapasCheckboxesHtml(null, 'x')");
  assert.equal((todas.match(/type="checkbox"/g) || []).length, 11);
  assert.equal((todas.match(/ checked>/g) || []).length, 11);
  const algumas = rodar(c, "etapasCheckboxesHtml(['triagem', 'video'], 'x')");
  assert.equal((algumas.match(/ checked>/g) || []).length, 2);
  assert.ok(todas.includes('o candidato não recebe e-mail'));
  assert.ok(
    !todas.includes('value="nova"') && !todas.includes('value="aprovado"'),
    'as fixas não aparecem pra desligar'
  );
});

test('editor da vaga: tem salvar e, só havendo outras vagas, o "copiar de"; nomes escapados', () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Analista <script>x</script>' }]; state.rs = { requisicoes: [{ id: 'v1', cargoId: 'cg', codigo: 'REQ-001' }], candidatos: [] };`
  );
  const so = rodar(c, 'etapasVagaEditorHtml(state.rs.requisicoes[0])');
  assert.ok(so.includes('Salvar etapas') && !so.includes('Copiar de outra vaga'));
  rodar(c, "state.rs.requisicoes.push({ id: 'v2', cargoId: 'cg', codigo: 'REQ-002' });");
  const duas = rodar(c, 'etapasVagaEditorHtml(state.rs.requisicoes[0])');
  assert.ok(duas.includes('Copiar de outra vaga') && duas.includes('REQ-002') && !duas.includes('REQ-001)'));
  assert.ok(!duas.includes('<script>'));
});

test('salvar etapas da vaga: lê as marcadas da tela, descarta valores inventados e guarda na vaga', () => {
  const c = ctx();
  rodar(c, "state.rs = { requisicoes: [{ id: 'v1', cargoId: 'cg', codigo: 'R' }], candidatos: [] };");
  c.document.querySelectorAll = () => ['triagem', 'video', 'nova', '<img>', 'triagem'].map((value) => ({ value }));
  rodar(c, "salvarEtapasVagaRS('v1')");
  assert.deepEqual(plano(rodar(c, 'state.rs.requisicoes[0].etapasAtivas')), ['triagem', 'video']);
  assert.ok(c.__toasts.some((t) => t.includes('salvas')));
  rodar(c, "salvarEtapasVagaRS('inexistente')"); // não quebra
});

test('copiar etapas de outra vaga: copia o que a outra usa; sem escolher a origem, avisa', () => {
  const c = ctx();
  rodar(
    c,
    "state.rs = { requisicoes: [{ id: 'v1', codigo: 'A' }, { id: 'v2', codigo: 'B', etapasAtivas: ['triagem', 'prova_teorica'] }], candidatos: [] };"
  );
  c.document.getElementById = (id) => (id === 'rs_etapas_copiar_v1' ? { value: 'v2' } : null);
  rodar(c, "copiarEtapasVagaRS('v1')");
  assert.deepEqual(plano(rodar(c, 'state.rs.requisicoes[0].etapasAtivas')), ['triagem', 'prova_teorica']);
  c.document.getElementById = () => ({ value: '' });
  rodar(c, "state.rs.requisicoes[0].etapasAtivas = ['video']; copiarEtapasVagaRS('v1')");
  assert.deepEqual(plano(rodar(c, 'state.rs.requisicoes[0].etapasAtivas')), ['video'], 'sem origem nada muda');
  assert.ok(c.__toasts.some((t) => t.includes('Escolha de qual vaga')));
});

// ======================= integração e transparência =======================
test('integração: o funil usa as etapas da vaga, a vaga nova guarda as etapas e os dados de teste usam etapas que existem', () => {
  const rs = ler('js/40-page-rs.js');
  assert.ok(
    /etapasParaSelecaoRS\(\s*vaga,\s*c\s*\)/.test(
      ler('js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js')
    ),
    'o seletor de etapa da ficha deve usar as etapas da vaga'
  );
  assert.ok(
    rs.includes("document.querySelectorAll('.rs-req-etapa:checked')") && rs.includes('etapasAtivas: etapasMarcadasRS(')
  );
  assert.ok(rs.includes("etapasCheckboxesHtml(null, 'rs-req-etapa')") && rs.includes('etapasVagaEditorHtml(vaga)'));
  assert.ok(rs.includes('migrarEtapasLegadasRS(state.rs.candidatos'));
  assert.ok(!/const ETAPAS_RS = \[/.test(rs), 'o catálogo deve existir só em js/45-rs-etapas.js');
  assert.ok(
    ler('app.html').includes(
      'js/45-rs-etapas.js',
      'js/46-rs-video.js',
      'js/48-rs-quadro.js',
      'js/49-rs-entrega.js',
      'js/50-rs-importacao.js'
    )
  );
  const c = ctx();
  const ids = plano(rodar(c, 'ETAPAS_RS')).map((e) => e.id);
  [...ler('js/21-dados-teste.js').matchAll(/\{ nome: '[^']+', etapa: '(\w+)' \}/g)].forEach((m) =>
    assert.ok(ids.includes(m[1]), `dados de teste com etapa inexistente: ${m[1]}`)
  );
});

test('transparência: o candidato é avisado (na página de candidatura e na Política) de que o currículo e perfis profissionais públicos podem ser verificados', () => {
  assert.ok(/verificação das informações do seu currículo e de perfis profissionais públicos/.test(ler('vaga.html')));
  const priv = ler('privacidade.html');
  assert.ok(/verificação das informações do currículo e de perfis\s+profissionais públicos/.test(priv));
  assert.ok(/acessíveis apenas ao Administrador e ao RH/.test(priv));
});

// ======================= orientações e links por etapa =======================
test('urlSegura: só https:// de verdade — recusa http, javascript:, espaço, aspas, "usuario@" e endereço sem domínio', () => {
  const c = ctx();
  const u = (x) => rodar(c, `urlSegura(${JSON.stringify(x)})`);
  assert.equal(u('https://exemplo.com.br/teste'), 'https://exemplo.com.br/teste');
  assert.equal(u('  https://exemplo.com.br/a?b=1  '), 'https://exemplo.com.br/a?b=1');
  for (const ruim of [
    'http://exemplo.com',
    'javascript:alert(1)',
    'data:text/html,<b>',
    'ftp://exemplo.com',
    '//exemplo.com',
    'exemplo.com',
    'https://localhost',
    'https://exemplo',
    'https://bom.com@golpe.com/x',
    'https://u:senha@exemplo.com',
    'https://exemplo.com/a b',
    'https://exemplo.com/"onmouseover="x',
    "https://exemplo.com/'",
    'https://exemplo.com/<script>',
    '',
    '   ',
    null,
    undefined,
    42,
  ])
    assert.equal(u(ruim), '', String(ruim));
  assert.equal(u('https://exemplo.com/' + 'a'.repeat(300)), '', 'endereço longo demais');
});

test('configEtapaSanitizada: limites de tamanho e de quantidade, links inválidos descartados, rótulo padrão = o endereço', () => {
  const c = ctx();
  const s = (x) => plano(rodar(c, `configEtapaSanitizada(${JSON.stringify(x)})`));
  const r = s({
    instrucoes: `  ${'x'.repeat(600)}  `,
    links: [
      { rotulo: 'DISC', url: 'https://a.com/disc' },
      { rotulo: 'Ruim', url: 'http://b.com' },
      { rotulo: '', url: 'https://c.com/x' },
      { rotulo: 'R'.repeat(100), url: 'https://d.com' },
      { rotulo: 'Quinto', url: 'https://e.com' },
    ],
  });
  assert.equal(r.instrucoes.length, 500);
  assert.equal(r.links.length, 3, 'no máximo 3 links');
  assert.deepEqual(
    r.links.map((l) => l.url),
    ['https://a.com/disc', 'https://c.com/x', 'https://d.com/']
  );
  assert.equal(r.links[1].rotulo, 'https://c.com/x');
  assert.equal(r.links[2].rotulo.length, 60);
  assert.deepEqual(s(null), { instrucoes: '', links: [] });
  assert.deepEqual(s('texto'), { instrucoes: '', links: [] });
  assert.deepEqual(s({ links: 'não é lista' }), { instrucoes: '', links: [] });
  assert.equal(s({ instrucoes: 'a\u0000b' }).instrucoes, 'ab');
});

test('bloco do e-mail: orientações e links escapados, quebra de linha preservada, aviso de site externo — e vazio quando não há nada', () => {
  const c = ctx();
  const b = (x) => rodar(c, `blocoConfigEtapaHtml(${JSON.stringify(x)})`);
  assert.equal(b(null), '');
  assert.equal(b({}), '');
  assert.equal(
    b({ instrucoes: '   ', links: [{ rotulo: 'x', url: 'http://inseguro.com' }] }),
    '',
    'só tinha link inválido: nada a mostrar'
  );
  const html = b({
    instrucoes: 'Faça o teste <b>hoje</b>.\nEnvie o resultado.',
    links: [{ rotulo: 'Teste <img src=x>', url: 'https://exemplo.com/t?a=1&b=2' }],
  });
  assert.ok(html.includes('Faça o teste &lt;b&gt;hoje&lt;/b&gt;.<br>Envie o resultado.'));
  assert.ok(!html.includes('<img') && !html.includes('<b>hoje'));
  assert.ok(html.includes('href="https://exemplo.com/t?a=1&amp;b=2"'));
  assert.ok(html.includes('sites externos') && html.includes('política de privacidade'));
  assert.ok(!b({ instrucoes: 'só texto' }).includes('sites externos'), 'sem link não precisa do aviso de site externo');
});

test('e-mail da etapa DISC/GALT: com orientações leva os links e diz "logo abaixo"; sem orientações continua "em breve"', async () => {
  const c = ctx();
  const enviados = [];
  c.sb = { functions: { invoke: async (nome, o) => (enviados.push(o.body), { data: {}, error: null }) } };
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Analista' }]; state.rs = { requisicoes: [{ id: 'v1', cargoId: 'cg', codigo: 'R' }], candidatos: [], configEtapas: {} };`
  );
  const cand = JSON.stringify({ nome: 'Ana', email: 'ana@x.com', vagaId: 'v1' });
  await rodar(c, `enviarEmailEtapaRS(${cand}, 'disc_galt')`);
  assert.ok(enviados[0].corpoHtml.includes('em breve') && !enviados[0].corpoHtml.includes('<ul>'));
  rodar(
    c,
    `state.rs.configEtapas.disc_galt = { instrucoes: 'Envie o resultado para rh@empresa.com', links: [{ rotulo: 'Teste DISC', url: 'https://exemplo.com/disc' }, { rotulo: 'Perfil', url: 'https://outro.com/perfil' }] };`
  );
  await rodar(c, `enviarEmailEtapaRS(${cand}, 'disc_galt')`);
  const html = enviados[1].corpoHtml;
  assert.ok(html.includes('logo abaixo') && !html.includes('em breve'));
  assert.ok(
    html.includes('href="https://exemplo.com/disc"') &&
      html.includes('href="https://outro.com/perfil"') &&
      html.includes('Envie o resultado para rh@empresa.com')
  );
});

test('orientações só existem nas etapas que mandam e-mail ao candidato: as internas e as fixas não são configuráveis', () => {
  const c = ctx();
  const ids = plano(rodar(c, 'etapasConfiguraveisRS().map((e) => e.id)'));
  assert.ok(!ids.includes('redes_sociais') && !ids.includes('checagem_curriculo'));
  assert.ok(!ids.includes('nova') && !ids.includes('proposta') && !ids.includes('aprovado'));
  assert.ok(
    ids.includes('disc_galt') &&
      ids.includes('video') &&
      ids.includes('entrevista_fit') &&
      ids.includes('prova_pratica')
  );
  assert.equal(ids.length, 9);
});

test('integração: o e-mail da etapa e a tela de R&S usam a configuração; os links NÃO estão escritos no código; a Política cita sites de terceiros', () => {
  const rs = ler('js/40-page-rs.js');
  assert.ok(
    /montarEmailEtapaRS\(\{[\s\S]*?cfg: cfgEtapa/.test(rs) &&
      /blocoConfigEtapaHtml\(cfg, etapa, hoje\)/.test(rs) &&
      /temOrientacoesEtapaRS\(cfg, etapa\)/.test(rs)
  );
  assert.ok(rs.includes('state.rs.configEtapas = {}'));
  for (const arq of [
    'js/40-page-rs.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/21-dados-teste.js',
  ])
    assert.ok(!/pactorh|personalidades\.mobi/.test(ler(arq)), `${arq}: link de terceiro escrito no código`);
  assert.ok(/Algumas\s+etapas\s+podem\s+ser\s+realizadas\s+em\s+sites\s+de\s+terceiros/.test(ler('privacidade.html')));
});

test('catálogo: ids únicos, só 3 etapas fixas, tipos válidos (sem "prova"), internas são só as 2 de verificação', () => {
  const c = ctx();
  const lista = plano(rodar(c, 'ETAPAS_RS'));
  assert.equal(new Set(lista.map((e) => e.id)).size, lista.length);
  assert.deepEqual(
    lista.filter((e) => e.fixa).map((e) => e.id),
    ['nova', 'proposta', 'aprovado']
  );
  lista
    .filter((e) => e.tipo)
    .forEach((e) => assert.ok(['registro', 'entrevista', 'video'].includes(e.tipo), `${e.id}: tipo ${e.tipo}`));
  assert.ok(!lista.some((e) => e.tipo === 'prova'), 'o recurso de provas automáticas foi retirado');
  assert.deepEqual(
    lista.filter((e) => e.interna).map((e) => e.id),
    ['redes_sociais', 'checagem_curriculo']
  );
  assert.deepEqual(
    lista.filter((e) => e.tipo === 'entrevista').map((e) => e.id),
    ['entrevista_fit', 'entrevista_final']
  );
  assert.deepEqual(
    lista.filter((e) => ['teste_logico', 'prova_teorica', 'prova_pratica'].includes(e.id)).map((e) => e.tipo),
    ['registro', 'registro', 'registro']
  );
});

test('e-mail de Teste lógico e Prova teórica: sem orientações "em breve", com orientações "logo abaixo" — e nunca promete link de prova', () => {
  const c = ctx();
  for (const id of ['teste_logico', 'prova_teorica']) {
    const sem = rodar(c, `RS_EMAIL_POR_ETAPA.${id}.corpo('Ana', 'Vaga', false)`);
    const com = rodar(c, `RS_EMAIL_POR_ETAPA.${id}.corpo('Ana', 'Vaga', true)`);
    assert.ok(sem.includes('em breve') && !sem.includes('logo abaixo'), id);
    assert.ok(com.includes('logo abaixo') && !com.includes('em breve'), id);
    assert.ok(!/link da prova/i.test(sem + com), `${id}: não existe mais link de prova automático`);
  }
});

test('painel de orientações: um bloco por etapa; salvar sanitiza, ignora link inseguro (avisando) e apaga a etapa esvaziada', () => {
  const c = ctx();
  rodar(
    c,
    "meuPapelReal = 'rh'; state.rs = { requisicoes: [], candidatos: [], configEtapas: { video: { instrucoes: 'antiga', links: [] } } };"
  );
  const painel = rodar(c, 'rsConfigEtapasPainelHtml()');
  assert.equal(
    (painel.match(/<details/g) || []).length,
    16,
    'oito etapas (a prova prática não tem texto geral), cada uma com o formulário e a pré-visualização do e-mail'
  );
  assert.ok(painel.includes('https://') && painel.includes('configurada') && painel.includes('Salvar orientações'));
  const campos = {
    rsce_disc_galt_ins: 'Faça os dois testes',
    rsce_disc_galt_l0_r: 'DISC',
    rsce_disc_galt_l0_u: 'https://exemplo.com/disc',
    rsce_disc_galt_l1_r: 'Golpe',
    rsce_disc_galt_l1_u: 'http://inseguro.com',
    rsce_video_ins: '',
    rsce_video_l0_u: '',
  };
  c.document.getElementById = (id) => (id in campos ? { value: campos[id] } : null);
  rodar(c, 'salvarConfigEtapasRS()');
  assert.deepEqual(plano(rodar(c, 'state.rs.configEtapas.disc_galt')), {
    instrucoes: 'Faça os dois testes',
    links: [{ rotulo: 'DISC', url: 'https://exemplo.com/disc' }],
  });
  assert.equal(rodar(c, "'video' in state.rs.configEtapas"), false, 'etapa esvaziada é removida');
  assert.ok(c.__toasts.some((t) => t.includes('1 link(s) foram ignorados')));
});

test('o conteúdo digitado na configuração aparece escapado quando a tela reabre (sem injeção)', () => {
  const c = ctx();
  rodar(
    c,
    `meuPapelReal = 'owner'; state.rs = { requisicoes: [], candidatos: [], configEtapas: { video: { instrucoes: '<img src=x onerror=alert(1)>', links: [{ rotulo: '"><script>', url: 'https://exemplo.com/a' }] } } };`
  );
  const html = rodar(c, 'rsConfigEtapasPainelHtml()');
  assert.ok(!html.includes('<img src=x') && !html.includes('"><script>'));
});
