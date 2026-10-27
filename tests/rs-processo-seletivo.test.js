// =========================================================================
// Tela "R&S — Processo seletivo": o passo a passo na ordem da empresa (com quem faz e quantos candidatos estão
// em cada etapa), as vagas com o funil de cada uma e as orientações das etapas. Também garante que o recurso
// de provas automáticas continua RETIRADO e que o cadastro de pessoas saiu de dentro da vaga.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(raiz, f));
const plano = (x) => JSON.parse(JSON.stringify(x));

function ctx(papel = 'rh') {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/44-page-processo-seletivo.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
    'js/47-rs-cadastro.js',
  ]);
  c.meuPapelReal = papel;
  c.showToast = () => {};
  c.render = () => {};
  c.URL = URL;
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
function paginaCom(c, rs, cargos = []) {
  rodar(c, `state.rs = ${JSON.stringify(rs)}; state.cargos = ${JSON.stringify(cargos)}; state.estrutura = [];`);
  return rodar(c, 'pageProcessoSeletivoRS()');
}

// ======================= funções puras =======================
test('contagem por etapa: conta quem está lá AGORA; ignora reprovados e quem só está cadastrado (sem vaga)', () => {
  const c = ctx();
  const cands = [
    { vagaId: 'v1', etapa: 'triagem' },
    { vagaId: 'v1', etapa: 'triagem' },
    { vagaId: 'v1', etapa: 'triagem', reprovado: true },
    { vagaId: 'v2', etapa: 'video' },
    { vagaId: null, etapa: null }, // só cadastrada no Recrutamento
    { vagaId: 'v3', etapa: 'aprovado', reprovado: false },
  ];
  assert.deepEqual(plano(rodar(c, `contagemPorEtapaRS(${JSON.stringify(cands)})`)), {
    triagem: 2,
    video: 1,
    aprovado: 1,
  });
  assert.deepEqual(plano(rodar(c, 'contagemPorEtapaRS([])')), {});
  assert.deepEqual(plano(rodar(c, 'contagemPorEtapaRS(null)')), {});
});

test('o passo a passo segue EXATAMENTE a lista da empresa: 1 e 2 são da vaga, 3 a 13 do candidato, e proposta/aprovado fecham', () => {
  const c = ctx();
  const passos = plano(rodar(c, 'passosDoProcessoRS({}, { pendentes: 0, publicadas: 0 })'));
  assert.deepEqual(
    passos.map((p) => [p.num, p.nome]),
    [
      ['1', 'Construção do perfil da vaga'],
      ['2', 'Divulgação da vaga'],
      ['', 'Nova candidatura'],
      ['3', 'Triagem dos currículos'],
      ['4', 'Teste DISC e GALT'],
      ['5', 'Vídeo de apresentação'],
      ['6', 'Verificação nas redes sociais'],
      ['7', 'Checagem de informações do currículo'],
      ['8', 'Entrevista de fit cultural'],
      ['9', 'Teste lógico'],
      ['10', 'Prova teórica'],
      ['11', 'Prova prática'],
      ['12', 'Entrevista final'],
      ['13', 'Escolha do candidato'],
      ['→', 'Proposta'],
      ['→', 'Aprovado'],
    ]
  );
});

test('cada passo diz quem faz e o que acontece (em linguagem simples); as etapas internas são "Só você"', () => {
  const c = ctx();
  const passos = plano(rodar(c, 'passosDoProcessoRS({}, null)'));
  passos.forEach((p) => assert.ok(p.quem && p.texto.length > 15, `${p.nome}: sem explicação`));
  const por = (nome) => passos.find((p) => p.nome === nome);
  assert.equal(por('Verificação nas redes sociais').quem, 'Só você');
  assert.equal(por('Checagem de informações do currículo').quem, 'Só você');
  assert.match(por('Verificação nas redes sociais').texto, /não recebe e-mail/);
  assert.equal(por('Vídeo de apresentação').quem, 'Candidato e você');
  assert.match(por('Vídeo de apresentação').texto, /2 minutos/);
  assert.match(por('Prova prática').texto, /criada para a vaga/);
  const ids = plano(rodar(c, 'ETAPAS_RS')).map((e) => e.id);
  const ajuda = plano(rodar(c, 'ETAPA_AJUDA_RS'));
  ids.forEach((id) => assert.ok(ajuda[id], `etapa ${id} sem texto de ajuda`));
});

test('os números do passo a passo trazem a contagem de candidatos e o resumo das vagas', () => {
  const c = ctx();
  const passos = plano(rodar(c, 'passosDoProcessoRS({ triagem: 4, video: 2 }, { pendentes: 3, publicadas: 5 })'));
  const total = (nome) => passos.find((p) => p.nome === nome).total;
  assert.equal(total('Triagem dos currículos'), '4');
  assert.equal(total('Vídeo de apresentação'), '2');
  assert.equal(total('Entrevista final'), '0');
  assert.equal(total('Construção do perfil da vaga'), '3 aguardando aprovação');
  assert.equal(total('Divulgação da vaga'), '5 publicada(s)');
});

// ======================= a tela =======================
test('acesso: Administrador, RH e líder entram (o líder pede vagas); colaborador e sem papel veem o aviso', () => {
  for (const papel of ['owner', 'rh', 'lider'])
    assert.ok(paginaCom(ctx(papel), { requisicoes: [], candidatos: [] }).includes('R&S — Processo seletivo'), papel);
  for (const papel of ['colaborador', null])
    assert.ok(
      paginaCom(ctx(papel), { requisicoes: [], candidatos: [] }).includes('Você não tem acesso'),
      String(papel)
    );
});

test('a tela mostra "Para você fazer agora", o seletor de vaga e o passo a passo recolhido com a quantidade de candidatos em cada etapa', () => {
  const c = ctx();
  const html = paginaCom(c, {
    requisicoes: [],
    candidatos: [
      { vagaId: 'v1', etapa: 'triagem' },
      { vagaId: 'v1', etapa: 'triagem' },
      { vagaId: 'v1', etapa: 'video' },
      { vagaId: 'v1', etapa: 'triagem', reprovado: true },
      { vagaId: null, etapa: null },
    ],
  });
  assert.ok(html.includes('Para você fazer agora') && html.includes('Como funciona: o passo a passo'));
  const linha = (nome) => new RegExp(`<td><b>${nome}</b></td>([\\s\\S]*?)</tr>`).exec(html)[1];
  assert.ok(/<b>2<\/b>/.test(linha('Triagem dos currículos')), 'triagem tem 2 (o reprovado não conta)');
  assert.ok(/<b>1<\/b>/.test(linha('Vídeo de apresentação')));
  assert.ok(/<b>0<\/b>/.test(linha('Entrevista final')));
  assert.ok(html.includes('Recrutamento'), 'explica que as pessoas ficam no Recrutamento');
  assert.ok(html.includes('DISC e o GALT') && html.includes('redes sociais'));
});

test('as vagas ficam NESTA tela e a vaga aprovada vira um QUADRO de 4 fases (sem cadastro de pessoa dentro da vaga)', () => {
  const c = ctx('rh');
  rodar(c, '_rsCandidaturasPendentes = { v1: [] };');
  const html = paginaCom(
    c,
    {
      requisicoes: [
        {
          id: 'v1',
          codigo: 'REQ-001',
          cargoId: 'c1',
          quantidade: 1,
          status: 'aprovada',
          publicada: true,
          vagaPublicaId: 'p1',
        },
      ],
      candidatos: [],
    },
    [{ id: 'c1', nome: 'Vendedor' }]
  );
  assert.ok(
    html.includes('Requisições de vaga') &&
      html.includes('Nova requisição') &&
      html.includes('REQ-001') &&
      html.includes('Abrir quadro')
  );
  for (const fase of ['1. Entrada', '2. Avaliação', '3. Entrevistas e provas', '4. Decisão'])
    assert.ok(html.includes(fase), fase);
  assert.ok(html.includes('Nenhum candidato nesta vaga ainda') && html.includes('Recrutamento'));
  assert.ok(
    !html.includes('+ Candidato') && !html.includes('rs_cand_nome'),
    'o cadastro de pessoa não fica mais dentro da vaga'
  );
});

test('orientações das etapas e indicadores: só Administrador e RH; o líder vê o quadro e as vagas, mas não a configuração', () => {
  for (const papel of ['owner', 'rh']) {
    const html = paginaCom(ctx(papel), { requisicoes: [], candidatos: [] });
    assert.ok(
      html.includes('Orientações e links que o candidato recebe') && html.includes('rsce_disc_galt_ins'),
      papel
    );
    assert.equal(
      (html.match(/<details/g) || []).length,
      3 + 16,
      'vagas + como funciona + orientações, mais uma etapa de cada das 8 com texto da empresa'
    );
  }
  const lider = paginaCom(ctx('lider'), { requisicoes: [], candidatos: [] });
  assert.ok(!lider.includes('rsce_') && !lider.includes('Orientações e links que o candidato recebe'));
  assert.ok(lider.includes('Requisições de vaga'));
});

test('nomes de cargo e de vaga com HTML aparecem como texto (sem injeção)', () => {
  const c = ctx();
  const html = paginaCom(
    c,
    {
      requisicoes: [{ id: 'v1', codigo: 'REQ-<img src=x>', cargoId: 'c1', quantidade: 1, status: 'aprovada' }],
      candidatos: [],
      configEtapas: { video: { instrucoes: '<script>alert(1)</script>', links: [] } },
    },
    [{ id: 'c1', nome: 'Analista <script>x</script>' }]
  );
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
});

test('a tela migra candidatos do funil antigo antes de contar (nada fica "invisível" numa etapa que não existe mais)', () => {
  const c = ctx();
  const html = paginaCom(c, { requisicoes: [], candidatos: [{ vagaId: 'v1', etapa: 'finalista', historico: [] }] });
  assert.ok(/<td><b>Escolha do candidato<\/b><\/td>[\s\S]*?<b>1<\/b>/.test(html));
});

// ======================= integração =======================
test('menu: Recrutamento (Administrador e RH), Processo seletivo (também líder) e Banco de talentos, nessa ordem; rotas e scripts', () => {
  const nav = ler('js/05-navigation.js');
  const ordem = [
    ...nav.matchAll(/id: '(rs|rs_processo|rs_talentos)', label: '([^']+)', group: 'Pessoas', papeis: (\[[^\]]*\])/g),
  ].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(ordem, [
    ['rs', 'R&S — Recrutamento', "['owner', 'rh']"],
    ['rs_processo', 'R&S — Processo seletivo', "['owner', 'rh', 'lider']"],
    ['rs_talentos', 'R&S — Banco de talentos', "['owner', 'rh']"],
  ]);
  const router = ler('js/07-router-dashboard.js');
  assert.ok(router.includes("case 'rs_processo':") && router.includes('pageProcessoSeletivoRS()'));
  assert.ok(/case 'rs':\s*return pageRS\(\);/.test(router));
  const app = ler('app.html');
  assert.ok(app.includes('js/44-page-processo-seletivo.js') && app.includes('js/47-rs-cadastro.js'));
  assert.ok(!nav.includes('rs_provas'));
});

test('o cadastro de pessoa saiu de dentro da vaga: as funções antigas não existem mais; só o Recrutamento cadastra', () => {
  const rs = ler('js/40-page-rs.js');
  for (const f of ['abrirNovoCandidatoRS', 'criarCandidatoRS', '_rsNovoCandidatoAberto', 'rs_cand_nome', '+ Candidato'])
    assert.ok(!rs.includes(f), `js/40 ainda tem ${f}`);
  assert.ok(ler('js/47-rs-cadastro.js').includes('function criarPessoaRS()'));
});

// ======================= o recurso de provas saiu por inteiro =======================
test('PROVAS RETIRADAS: arquivos do recurso não existem mais', () => {
  for (const f of [
    'js/44-page-provas.js',
    'prova.html',
    'docs/PROVAS-RS.md',
    'tests/provas-servidor.test.js',
    'tests/provas-cliente.test.js',
    'supabase/functions/provas-rs/index.ts',
  ])
    assert.equal(existe(f), false, `${f} deveria ter sido removido`);
});

test('PROVAS RETIRADAS: nenhum código, configuração ou workflow referencia a função, as tabelas ou a página das provas', () => {
  const proibidos =
    /provas-rs|rs_provas|prova\.html|pageProvasRS|provaCelulaRS|provaBotaoRS|provaPainelAplicarRS|PROVA_LIMITES|PROVAS_MODELOS|manterProvasRs|PROVAS_RETENCAO/;
  const pastas = ['js', 'supabase', 'scripts', '.github', 'docs'];
  const arquivos = [
    'app.html',
    'index.html',
    'vaga.html',
    'privacidade.html',
    'termos.html',
    'package.json',
    '.eslintrc.json',
    'sw.js',
  ];
  const achados = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) varrer(rel);
      else if (proibidos.test(ler(rel))) achados.push(rel);
    }
  };
  pastas.filter(existe).forEach(varrer);
  arquivos.filter(existe).forEach((f) => proibidos.test(ler(f)) && achados.push(f));
  assert.deepEqual(
    achados.filter((f) => !f.endsWith('PROCESSO-SELETIVO.md')),
    [],
    'restos do recurso de provas'
  );
});

test('PROVAS RETIRADAS: Política de Privacidade, Termos e FAQ não falam mais das provas automáticas', () => {
  for (const f of ['privacidade.html', 'termos.html'])
    assert.ok(!/provas? de conhecimento|Provas aplicadas|provas aplicadas/i.test(ler(f)), f);
  const faq = ler('js/41-page-central-ajuda.js');
  assert.ok(!/R&S — Provas|aplico uma prova|gabarito da prova|nota mínima da prova/.test(faq));
  assert.ok(faq.includes('Onde vejo e ajusto as etapas do processo seletivo?'));
  assert.ok(!/Provas de conhecimento/.test(ler('supabase/functions/assistente-ajuda/index.ts')));
});

test('PROVAS RETIRADAS: a migração 41 apaga as duas tabelas (a 40 fica como histórico) e a rotina diária não mexe mais nelas', () => {
  const sql = ler('sql/41-remover-provas.sql');
  assert.ok(/drop table if exists rs_provas_aplicacoes;/.test(sql) && /drop table if exists rs_provas;/.test(sql));
  assert.ok(
    sql.indexOf('rs_provas_aplicacoes') < sql.indexOf('drop table if exists rs_provas;'),
    'apagar primeiro a tabela que depende da outra'
  );
  assert.ok(/Não dá pra desfazer/.test(sql));
  assert.ok(existe('sql/40-provas-rs.sql'), 'o histórico das migrações é preservado');
  const rotina = ler('supabase/functions/rotinas-agendadas/index.ts');
  assert.ok(!/provas_rs|rs_provas/.test(rotina));
  for (const nome of [
    'lembretes_ciclos',
    'escalonamento_ponto',
    'banco_talentos',
    'teste_gratis',
    'nr1_campanhas',
    'limpeza_logs',
  ])
    assert.ok(rotina.includes(`tarefa('${nome}'`), nome);
});
