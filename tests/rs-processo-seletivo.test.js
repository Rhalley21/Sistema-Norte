// =========================================================================
// Tela "R&S — Processo seletivo" (no lugar das provas): as etapas na ordem da empresa, quantos candidatos
// estão em cada uma, as orientações de cada etapa e as etapas de cada vaga. Também garante que o recurso
// de provas automáticas foi RETIRADO por inteiro e não volta por engano.
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
  ]);
  c.meuPapelReal = papel;
  c.showToast = () => {};
  c.render = () => {};
  c.URL = URL;
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);

// ======================= funções puras =======================
test('tipo de cada etapa em linguagem do RH', () => {
  const c = ctx();
  const t = (id) => rodar(c, `etapaTipoRotuloRS(ETAPAS_RS.find((e) => e.id === '${id}'))`);
  assert.equal(t('nova'), 'Fixa em toda vaga');
  assert.equal(t('proposta'), 'Fixa em toda vaga');
  assert.equal(t('redes_sociais'), 'Verificação interna');
  assert.equal(t('checagem_curriculo'), 'Verificação interna');
  assert.equal(t('disc_galt'), 'Registro de resultado');
  assert.equal(t('prova_pratica'), 'Registro de resultado');
  assert.equal(t('entrevista_final'), 'Entrevista');
  assert.equal(t('video'), 'Vídeo de apresentação');
  assert.equal(t('triagem'), 'Etapa do funil');
  assert.equal(t('escolha'), 'Etapa do funil');
});

test('contagem por etapa: conta quem está lá AGORA e ignora reprovados e desistentes', () => {
  const c = ctx();
  const cands = [
    { etapa: 'triagem' },
    { etapa: 'triagem' },
    { etapa: 'triagem', reprovado: true },
    { etapa: 'video' },
    { etapa: 'aprovado', reprovado: false },
  ];
  assert.deepEqual(plano(rodar(c, `contagemPorEtapaRS(${JSON.stringify(cands)})`)), {
    triagem: 2,
    video: 1,
    aprovado: 1,
  });
  assert.deepEqual(plano(rodar(c, 'contagemPorEtapaRS([])')), {});
  assert.deepEqual(plano(rodar(c, 'contagemPorEtapaRS(null)')), {});
});

test('resumo por vaga: ignora vaga encerrada, mostra só as etapas opcionais usadas e conta candidatos ativos', () => {
  const c = ctx();
  const rs = {
    requisicoes: [
      { id: 'v1', cargoId: 'c1', codigo: 'REQ-001' },
      { id: 'v2', cargoId: 'c2', codigo: 'REQ-002', etapasAtivas: ['triagem', 'entrevista_final'] },
      { id: 'v3', cargoId: 'c1', codigo: 'REQ-003', encerrada: true },
      { id: 'v4', cargoId: 'inexistente', codigo: 'REQ-004', etapasAtivas: [] },
    ],
    candidatos: [
      { vagaId: 'v1' },
      { vagaId: 'v1', reprovado: true },
      { vagaId: 'v2' },
      { vagaId: 'v2' },
      { vagaId: 'v3' },
    ],
  };
  const r = plano(
    rodar(
      c,
      `resumoVagasProcessoRS(${JSON.stringify(rs)}, [{ id: 'c1', nome: 'Analista' }, { id: 'c2', nome: 'Vendedor' }])`
    )
  );
  assert.deepEqual(
    r.map((v) => v.id),
    ['v1', 'v2', 'v4']
  );
  assert.equal(r[0].usaTodas, true);
  assert.equal(r[0].candidatos, 1, 'o reprovado não conta');
  assert.equal(r[0].nome, 'Analista');
  assert.equal(r[1].usaTodas, false);
  assert.deepEqual(r[1].etapas, ['Triagem dos currículos', 'Entrevista final']);
  assert.equal(r[1].candidatos, 2);
  assert.equal(r[2].nome, 'REQ-004', 'sem cargo, mostra o código');
  assert.deepEqual(r[2].etapas, []);
});

// ======================= a tela =======================
function paginaCom(c, rs, cargos = []) {
  rodar(c, `state.rs = ${JSON.stringify(rs)}; state.cargos = ${JSON.stringify(cargos)};`);
  return rodar(c, 'pageProcessoSeletivoRS()');
}

test('só Administrador e RH acessam a tela; líder, colaborador e sem papel veem o aviso', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const html = paginaCom(ctx(papel), { requisicoes: [], candidatos: [] });
    assert.ok(html.includes('Só o Administrador e o RH'), String(papel));
    assert.ok(!html.includes('Etapas do processo'));
  }
  for (const papel of ['owner', 'rh'])
    assert.ok(paginaCom(ctx(papel), { requisicoes: [], candidatos: [] }).includes('R&S — Processo seletivo'), papel);
});

test('a tabela de etapas segue EXATAMENTE a numeração e a ordem da lista da empresa (3 a 13), com fixas sem número', () => {
  const c = ctx();
  const html = paginaCom(c, { requisicoes: [], candidatos: [] });
  const tabela = html.slice(
    html.indexOf('<h3>Etapas do processo</h3>'),
    html.indexOf('Orientações e links das etapas')
  );
  const linhas = [...tabela.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td><b>([^<]+)<\/b><\/td>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(linhas, [
    ['—', 'Nova candidatura'],
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
    ['—', 'Proposta'],
    ['—', 'Aprovado'],
  ]);
});

test('a tela mostra quantos candidatos há em cada etapa, quais etapas têm orientações e que as internas não mandam e-mail', () => {
  const c = ctx();
  const rs = {
    requisicoes: [],
    candidatos: [{ etapa: 'triagem' }, { etapa: 'triagem' }, { etapa: 'video' }, { etapa: 'triagem', reprovado: true }],
    configEtapas: { disc_galt: { instrucoes: 'Faça os testes', links: [] } },
  };
  const html = paginaCom(c, rs);
  const linha = (nome) =>
    new RegExp(`<tr>\\s*<td>[^<]*</td>\\s*<td><b>${nome}</b></td>([\\s\\S]*?)</tr>`).exec(html)[1];
  assert.ok(/<b>2<\/b>/.test(linha('Triagem dos currículos')), 'triagem tem 2 (o reprovado não conta)');
  assert.ok(/<b>1<\/b>/.test(linha('Vídeo de apresentação')));
  assert.ok(/<b>0<\/b>/.test(linha('Entrevista final')));
  assert.ok(linha('Teste DISC e GALT').includes('configuradas'));
  assert.ok(linha('Vídeo de apresentação').includes('sem orientações'));
  const redes = linha('Verificação nas redes sociais');
  assert.ok(redes.includes('Verificação interna') && />não</.test(redes), 'etapa interna: sem e-mail');
});

test('a tela traz o painel de orientações, o aviso sobre as etapas 1 e 2 / DISC e GALT / redes sociais, e as etapas por vaga', () => {
  const c = ctx();
  const html = paginaCom(
    c,
    {
      requisicoes: [
        { id: 'v1', cargoId: 'c1', codigo: 'REQ-001' },
        { id: 'v2', cargoId: 'c1', codigo: 'REQ-002', etapasAtivas: ['triagem'] },
      ],
      candidatos: [{ vagaId: 'v1', etapa: 'nova' }],
    },
    [{ id: 'c1', nome: 'Analista' }]
  );
  assert.ok(html.includes('Salvar orientações') && (html.match(/<details/g) || []).length === 8);
  assert.ok(html.includes('1 (perfil da vaga)') && html.includes('DISC e o GALT') && html.includes('redes sociais'));
  assert.ok(
    html.includes('Etapas por vaga') && html.includes('Todas as etapas') && html.includes('Triagem dos currículos')
  );
  assert.ok(html.includes("goto('rs')"));
  assert.ok(paginaCom(ctx(), { requisicoes: [], candidatos: [] }).includes('Nenhuma vaga em andamento'));
});

test('nomes de cargo e vaga com HTML aparecem como texto (sem injeção)', () => {
  const c = ctx();
  const html = paginaCom(
    c,
    {
      requisicoes: [{ id: 'v1', cargoId: 'c1', codigo: 'REQ-<img src=x>' }],
      candidatos: [],
      configEtapas: { video: { instrucoes: '<script>alert(1)</script>', links: [] } },
    },
    [{ id: 'c1', nome: 'Analista <script>x</script>' }]
  );
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
});

test('a tela migra candidatos do funil antigo antes de contar (nada fica "invisível" numa etapa que não existe mais)', () => {
  const c = ctx();
  const html = paginaCom(c, { requisicoes: [], candidatos: [{ etapa: 'finalista', historico: [] }] });
  assert.ok(/<td><b>Escolha do candidato<\/b><\/td>[\s\S]*?<b>1<\/b>/.test(html));
});

// ======================= integração =======================
test('menu, rota e página: "R&S — Processo seletivo" no lugar das provas', () => {
  assert.ok(
    /id: 'rs_processo', label: 'R&S — Processo seletivo', group: 'Pessoas', papeis: \['owner', 'rh'\]/.test(
      ler('js/05-navigation.js')
    )
  );
  assert.ok(ler('js/05-navigation.js').includes("case 'rs_processo':"));
  assert.ok(
    ler('js/07-router-dashboard.js').includes("case 'rs_processo':") &&
      ler('js/07-router-dashboard.js').includes('pageProcessoSeletivoRS()')
  );
  assert.ok(ler('app.html').includes('js/44-page-processo-seletivo.js'));
  assert.ok(!ler('js/05-navigation.js').includes('rs_provas'));
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
