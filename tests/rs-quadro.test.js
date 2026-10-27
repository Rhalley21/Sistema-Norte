// =========================================================================
// Quadro da vaga (a forma simples de trabalhar o processo seletivo): 4 fases, cartão com botão "Avançar" que vai
// para a PRÓXIMA etapa da vaga (pulando as que ela desligou), ficha da pessoa com a ação de cada etapa, faixa
// "Para você fazer agora" e o formulário da vaga com modelo de processo e detalhes recolhidos.
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
  c.__toasts = [];
  c.__renders = 0;
  c.__invocacoes = [];
  c.__gotos = [];
  c.confirm = () => true;
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.goto = (id) => c.__gotos.push(id);
  c.registrarAuditoria = () => {};
  c.sb = {
    functions: { invoke: async (nome, o) => (c.__invocacoes.push({ nome, body: o.body }), { data: {}, error: null }) },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const ETAPAS_TODAS = [
  'nova',
  'triagem',
  'disc_galt',
  'video',
  'redes_sociais',
  'checagem_curriculo',
  'entrevista_fit',
  'teste_logico',
  'prova_teorica',
  'prova_pratica',
  'entrevista_final',
  'escolha',
  'proposta',
  'aprovado',
];
const cand = (extra) => ({
  id: 'x',
  vagaId: 'v1',
  nome: 'Pessoa',
  email: 'p@x.com',
  telefone: '',
  origem: 'Cadastro manual',
  curriculo: '',
  etapa: 'nova',
  reprovado: false,
  historico: [],
  scorecards: [],
  ...extra,
});

function cenario(c, { requisicoes, candidatos = [], videos = null } = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = [];
    state.rs = { requisicoes: ${J(requisicoes || [{ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', quantidade: 1, status: 'aprovada' }])}, candidatos: ${J(candidatos)}, configEtapas: {} };
    _rsCandidaturasPendentes = { v1: [], v2: [] }; _rsRequisicaoExpandida = null; _psFichaAberta = null; _psVagasAberto = false; _rsNovaRequisicaoAberta = false;
    _rsVideos = ${J(videos)}; _rsVideosErro = '';`
  );
}

// ======================= funções puras =======================
test('as 4 fases cobrem TODAS as etapas, cada uma em exatamente uma fase, na ordem do processo', () => {
  const c = ctx();
  const fases = plano(rodar(c, 'FASES_PROCESSO_RS'));
  assert.deepEqual(
    fases.map((f) => f.nome),
    ['1. Entrada', '2. Avaliação', '3. Entrevistas e provas', '4. Decisão']
  );
  const todas = fases.flatMap((f) => f.etapas);
  assert.deepEqual(todas, ETAPAS_TODAS, 'as fases, lidas em sequência, repetem a ordem das etapas');
  assert.deepEqual(
    todas,
    plano(rodar(c, 'ETAPAS_RS')).map((e) => e.id),
    'e batem com o catálogo de etapas'
  );
  assert.equal(new Set(todas).size, todas.length);
});

test('fase de cada etapa; etapa desconhecida não tem fase', () => {
  const c = ctx();
  const f = (id) => rodar(c, `faseDaEtapaRS(${J(id)})?.id ?? null`);
  assert.equal(f('nova'), 'entrada');
  assert.equal(f('video'), 'avaliacao');
  assert.equal(f('prova_pratica'), 'entrevistas');
  assert.equal(f('aprovado'), 'decisao');
  assert.equal(f('inventada'), null);
});

test('agrupar por fase: ordena pela etapa e depois pelo nome; reprovados ficam à parte', () => {
  const c = ctx();
  const lista = [
    cand({ id: 'a', nome: 'Zeca', etapa: 'video' }),
    cand({ id: 'b', nome: 'Ana', etapa: 'video' }),
    cand({ id: 'c', nome: 'Bia', etapa: 'triagem' }),
    cand({ id: 'd', nome: 'Caio', etapa: 'aprovado' }),
    cand({ id: 'e', nome: 'Davi', etapa: 'video', reprovado: true }),
  ];
  const g = plano(
    rodar(
      c,
      `(() => { const r = agruparPorFaseRS(${J(lista)}); return { fases: r.fases.map((x) => [x.fase.id, x.candidatos.map((k) => k.nome)]), reprovados: r.reprovados.map((k) => k.nome) }; })()`
    )
  );
  assert.deepEqual(g.fases, [
    ['entrada', ['Bia']],
    ['avaliacao', ['Ana', 'Zeca']],
    ['entrevistas', []],
    ['decisao', ['Caio']],
  ]);
  assert.deepEqual(g.reprovados, ['Davi']);
  assert.deepEqual(plano(rodar(c, 'agruparPorFaseRS(null).fases.length')), 4);
});

test('próxima etapa DA VAGA: segue a ordem e PULA as etapas que a vaga desligou; no fim do processo não há próxima', () => {
  const c = ctx();
  const prox = (vaga, etapa) => rodar(c, `proximaEtapaDaVagaRS(${J(vaga)}, ${J(etapa)})?.id ?? null`);
  assert.equal(prox({}, 'nova'), 'triagem');
  assert.equal(prox({}, 'triagem'), 'disc_galt');
  assert.equal(prox({}, 'escolha'), 'proposta');
  assert.equal(prox({}, 'proposta'), 'aprovado');
  assert.equal(prox({}, 'aprovado'), null);
  assert.equal(prox({}, 'inventada'), null);
  const enxuta = { etapasAtivas: ['triagem', 'entrevista_final'] };
  assert.equal(prox(enxuta, 'nova'), 'triagem');
  assert.equal(prox(enxuta, 'triagem'), 'entrevista_final');
  assert.equal(prox(enxuta, 'entrevista_final'), 'proposta');
  assert.equal(prox({ etapasAtivas: [] }, 'nova'), 'proposta');
  assert.equal(
    prox(enxuta, 'video'),
    'entrevista_final',
    'quem está numa etapa que a vaga desligou depois também avança'
  );
});

test('modelos de processo: completo (todas), enxuto e operacional; desconhecido vira completo; só etapas que existem', () => {
  const c = ctx();
  const m = (id) => plano(rodar(c, `etapasDoModeloRS(${J(id)})`));
  assert.equal(m('completo').length, 11);
  assert.deepEqual(m('enxuto'), ['triagem', 'entrevista_fit', 'prova_pratica', 'entrevista_final', 'escolha']);
  assert.deepEqual(m('operacional'), ['triagem', 'checagem_curriculo', 'entrevista_fit', 'escolha']);
  assert.deepEqual(m('inexistente'), m('completo'));
  const validos = new Set(plano(rodar(c, 'etapasOpcionaisRS().map((e) => e.id)')));
  for (const id of ['enxuto', 'operacional']) m(id).forEach((e) => assert.ok(validos.has(e), e));
  assert.deepEqual(Object.keys(plano(rodar(c, 'MODELOS_PROCESSO_RS'))), ['completo', 'enxuto', 'operacional']);
});

test('escolher um modelo marca na tela só as etapas dele (e o RH ainda ajusta)', () => {
  const c = ctx();
  const caixas = ETAPAS_TODAS.filter((id) => !['nova', 'proposta', 'aprovado'].includes(id)).map((value) => ({
    value,
    checked: true,
  }));
  c.document.querySelectorAll = (sel) => (sel === '.rs-req-etapa' ? caixas : []);
  rodar(c, "aplicarModeloProcessoRS('operacional')");
  assert.deepEqual(
    caixas.filter((x) => x.checked).map((x) => x.value),
    ['triagem', 'checagem_curriculo', 'entrevista_fit', 'escolha']
  );
  rodar(c, "aplicarModeloProcessoRS('completo')");
  assert.equal(
    caixas.every((x) => x.checked),
    true
  );
});

test('"Para você fazer agora": só o que pede ação; o líder não vê "vagas para aprovar"', () => {
  const c = ctx();
  const reqs = [
    { id: 'v1', status: 'aprovada', etapasAtivas: ['triagem', 'video'] },
    { id: 'v2', status: 'pendente' },
    { id: 'v3', status: 'aprovada', encerrada: true },
    { id: 'v4', status: 'aprovada', etapasAtivas: ['triagem', 'prova_pratica'] },
  ];
  const cands = [
    cand({ id: 'a', vagaId: 'v1', etapa: 'nova' }),
    cand({ id: 'b', vagaId: 'v1', etapa: 'nova', reprovado: true }),
    cand({ id: 'c', vagaId: 'v3', etapa: 'nova' }),
    cand({ id: 'd', vagaId: 'v1', etapa: 'aprovado' }),
    cand({ id: 'e', vagaId: 'v1', etapa: 'aprovado', convertidoEm: 'x' }),
    cand({ id: 'f', vagaId: 'v1', etapa: 'video' }),
  ];
  const videos = [
    { candidato_ref: 'f', status: 'enviado' },
    { candidato_ref: 'a', status: 'solicitado' },
  ];
  const acoes = (gestor, pend = { v1: [1, 2] }) =>
    plano(
      rodar(
        c,
        `acoesPendentesRS({ requisicoes: ${J(reqs)}, candidatos: ${J(cands)}, videos: ${J(videos)}, candidaturasPendentes: ${J(pend)}, vagaSelecionadaId: 'v1', gestor: ${gestor} })`
      )
    );
  const g = acoes(true);
  assert.deepEqual(
    g.map((a) => [a.chave, a.total]),
    [
      ['aprovar', 1],
      ['importar', 2],
      ['triar', 1],
      ['videos', 1],
      ['prova', 1],
      ['contratar', 1],
    ]
  );
  assert.equal(
    g.find((a) => a.chave === 'triar').vagaId,
    'v1',
    'a candidata da vaga encerrada e a reprovada não contam'
  );
  assert.equal(g.find((a) => a.chave === 'prova').vagaId, 'v4');
  assert.equal(g.find((a) => a.chave === 'videos').vagaId, 'v1');
  assert.ok(!acoes(false).some((a) => a.chave === 'aprovar'));
  assert.deepEqual(
    plano(
      rodar(
        c,
        'acoesPendentesRS({ requisicoes: [], candidatos: [], videos: [], candidaturasPendentes: {}, vagaSelecionadaId: null, gestor: true })'
      )
    ),
    []
  );
});

// ======================= escolher a vaga e agir =======================
test('a vaga do quadro: a escolhida; senão a primeira aprovada e aberta; pendente e reprovada nunca são o quadro', () => {
  const c = ctx();
  const reqs = [
    { id: 'p', status: 'pendente' },
    { id: 'e', status: 'aprovada', encerrada: true },
    { id: 'a', status: 'aprovada' },
    { id: 'b', status: 'aprovada' },
  ];
  cenario(c, { requisicoes: reqs });
  assert.equal(rodar(c, 'vagaSelecionadaRS()?.id'), 'a');
  rodar(c, "_rsRequisicaoExpandida = 'b'");
  assert.equal(rodar(c, 'vagaSelecionadaRS()?.id'), 'b');
  rodar(c, "_rsRequisicaoExpandida = 'e'");
  assert.equal(rodar(c, 'vagaSelecionadaRS()?.id'), 'e', 'dá pra ver o quadro de uma vaga encerrada');
  rodar(c, "_rsRequisicaoExpandida = 'p'");
  assert.equal(rodar(c, 'vagaSelecionadaRS()?.id'), 'a', 'vaga pendente não vira quadro');
  cenario(c, { requisicoes: [{ id: 'p', status: 'pendente' }] });
  assert.equal(rodar(c, 'vagaSelecionadaRS()'), null);
});

test('selecionar vaga fecha a ficha; abrir a ficha alterna; resolver pendência vai para a vaga certa', () => {
  const c = ctx();
  cenario(c, {
    requisicoes: [
      { id: 'v1', status: 'aprovada' },
      { id: 'v2', status: 'aprovada' },
      { id: 'v3', status: 'pendente' },
    ],
  });
  rodar(c, "abrirFichaRS('a')");
  assert.equal(rodar(c, '_psFichaAberta'), 'a');
  rodar(c, "abrirFichaRS('a')");
  assert.equal(rodar(c, '_psFichaAberta'), null);
  rodar(c, "abrirFichaRS('a'); selecionarVagaRS('v2')");
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), 'v2');
  assert.equal(rodar(c, '_psFichaAberta'), null);
  rodar(c, "resolverPendenciaRS('aprovar', null)");
  assert.equal(rodar(c, '_psVagasAberto'), true);
  rodar(c, "resolverPendenciaRS('prova', 'v1')");
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), 'v1');
  assert.equal(rodar(c, '_rsOrientacoesVagaAberta'), 'v1', 'a configuração da vaga abre para definir a prova prática');
  rodar(c, 'fecharFichaRS()');
  assert.equal(rodar(c, '_psFichaAberta'), null);
});

test('AVANÇAR leva para a próxima etapa da vaga (pulando as desligadas), registra no histórico e manda o e-mail da etapa', async () => {
  const c = ctx();
  cenario(c, {
    requisicoes: [
      { id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem', 'entrevista_final'] },
    ],
    candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'triagem' })],
  });
  rodar(c, "avancarCandidatoRS('a')");
  assert.equal(
    rodar(c, 'state.rs.candidatos[0].etapa'),
    'entrevista_final',
    'pulou DISC, vídeo, redes... que a vaga não usa'
  );
  const h = plano(rodar(c, 'state.rs.candidatos[0].historico.at(-1)'));
  assert.equal(h.de, 'triagem');
  assert.equal(h.para, 'entrevista_final');
  await esperar(30);
  assert.equal(c.__invocacoes.filter((x) => x.nome === 'enviar-email').length, 1);
});

test('avançar para a etapa de vídeo cria o pedido do vídeo (o mesmo caminho do seletor antigo)', async () => {
  const c = ctx('owner');
  cenario(c, {
    requisicoes: [{ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['video'] }],
    candidatos: [cand({ id: 'a', nome: 'Ana', email: 'ana@x.com', etapa: 'nova' })],
    videos: [],
  });
  c.sb.functions.invoke = async (nome, o) => (
    c.__invocacoes.push({ nome, body: o.body }),
    o.body.action === 'video_solicitar'
      ? { data: { ok: true, pedido: { id: 'vid1' }, link: 'https://s/v', emailEnviado: true }, error: null }
      : { data: { videos: [] }, error: null }
  );
  rodar(c, "avancarCandidatoRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'video');
  await esperar(40);
  assert.equal(c.__invocacoes.filter((x) => x.body.action === 'video_solicitar').length, 1);
});

test('avançar: o candidato da última etapa, o reprovado e o inexistente não andam', () => {
  const c = ctx();
  cenario(c, {
    candidatos: [cand({ id: 'a', etapa: 'aprovado' }), cand({ id: 'b', etapa: 'triagem', reprovado: true })],
  });
  rodar(c, "avancarCandidatoRS('a'); avancarCandidatoRS('b'); avancarCandidatoRS('nada')");
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'aprovado');
  assert.equal(rodar(c, 'state.rs.candidatos[1].etapa'), 'triagem');
  assert.ok(c.__toasts.some((t) => t.includes('última etapa')));
});

// ======================= o quadro na tela =======================
const quadro = (c, vagaId = 'v1') =>
  rodar(c, `quadroDaVagaHtml(state.rs.requisicoes.find((r) => r.id === '${vagaId}'))`);

test('o quadro tem as 4 colunas com a contagem, o nome abre a ficha e cada cartão traz "Avançar → próxima etapa"', () => {
  const c = ctx();
  cenario(c, {
    candidatos: [
      cand({ id: 'a', nome: 'Ana Souza', etapa: 'triagem' }),
      cand({ id: 'b', nome: 'Bruno', etapa: 'video' }),
      cand({ id: 'c', nome: 'Carla', etapa: 'prova_pratica' }),
      cand({ id: 'd', nome: 'Davi', etapa: 'proposta' }),
    ],
  });
  const h = quadro(c);
  for (const [fase, n] of [
    ['1. Entrada', 1],
    ['2. Avaliação', 1],
    ['3. Entrevistas e provas', 1],
    ['4. Decisão', 1],
  ])
    assert.ok(new RegExp(`${fase.replace('.', '\\.')} <span class="small-muted">\\(${n}\\)</span>`).test(h), fase);
  assert.ok(h.includes("abrirFichaRS('a')") && h.includes('Ana Souza'));
  assert.ok(h.includes('Avançar → Teste DISC e GALT'), 'Ana está na triagem: a próxima é DISC/GALT');
  assert.ok(h.includes('Avançar → Verificação nas redes sociais'));
  assert.ok(h.includes('Avançar → Entrevista final'));
  assert.ok(h.includes('Avançar → Aprovado'));
  assert.equal((h.match(/Reprovar<\/button>/g) || []).length, 4);
});

test('o botão Avançar respeita as etapas da vaga (o rótulo já mostra a próxima etapa REAL)', () => {
  const c = ctx();
  cenario(c, {
    requisicoes: [
      { id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem', 'entrevista_final'] },
    ],
    candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'triagem' })],
  });
  const h = quadro(c);
  assert.ok(h.includes('Avançar → Entrevista final') && !h.includes('Teste DISC e GALT'));
});

test('quem está aprovado vê "Converter em colaborador"; depois de convertido, "Contratado(a)" e sem Reprovar', () => {
  const c = ctx();
  cenario(c, {
    candidatos: [
      cand({ id: 'a', nome: 'Ana', etapa: 'aprovado' }),
      cand({ id: 'b', nome: 'Bia', etapa: 'aprovado', convertidoEm: '2026-10-01' }),
    ],
  });
  const h = quadro(c);
  assert.ok(h.includes("converterCandidatoEmColaboradorRS('a')") && h.includes('Converter em colaborador'));
  const cartaoBia = /Bia[\s\S]*?<\/div>\s*<\/div>/.exec(h)[0];
  assert.ok(
    cartaoBia.includes('Contratado(a)') && !cartaoBia.includes('Reprovar') && !cartaoBia.includes('converterCandidato')
  );
});

test('reprovados ficam numa lista recolhida com "Reabrir"; vaga sem candidatos mostra a orientação do Recrutamento', () => {
  const c = ctx();
  cenario(c, { candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'triagem', reprovado: true })] });
  const h = quadro(c);
  assert.ok(h.includes('Reprovados e desistências (1)') && h.includes("reabrirCandidatoRS('a')"));
  assert.ok(!h.includes('Avançar'), 'reprovado não tem Avançar');
  cenario(c, { candidatos: [] });
  assert.ok(quadro(c).includes('Nenhum candidato nesta vaga ainda') && quadro(c).includes("goto('rs')"));
});

test('no cartão do vídeo aparece a situação do pedido; fora da etapa de vídeo não aparece', () => {
  const c = ctx('owner');
  cenario(c, {
    candidatos: [
      cand({ id: 'a', nome: 'Ana', etapa: 'video' }),
      cand({ id: 'b', nome: 'Bia', etapa: 'video' }),
      cand({ id: 'c', nome: 'Caio', etapa: 'triagem' }),
    ],
    videos: [{ id: 'v9', candidato_ref: 'b', status: 'enviado', criado_em: '2026-10-01T00:00:00Z' }],
  });
  const h = quadro(c);
  assert.ok(h.includes('Vídeo: ainda não pedido') && h.includes('Vídeo enviado'));
  assert.equal((h.match(/Vídeo: ainda não pedido/g) || []).length, 1);
  const semPapel = ctx('lider');
  cenario(semPapel, { candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'video' })], videos: [] });
  assert.ok(!quadro(semPapel).includes('Vídeo: ainda não pedido'), 'só Administrador e RH veem o vídeo');
});

test('nomes de pessoa com HTML aparecem como texto no quadro e na ficha (sem injeção)', () => {
  const c = ctx();
  cenario(c, {
    candidatos: [
      cand({
        id: 'a',
        nome: 'Ana <img src=x onerror=alert(1)>',
        etapa: 'triagem',
        curriculo: '</details><script>x</script>',
        historico: [{ para: 'triagem', em: '2026-10-01T00:00:00Z', observacao: '<b>obs</b>' }],
      }),
    ],
  });
  rodar(c, "_psFichaAberta = 'a'");
  const h = quadro(c);
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>') && !h.includes('<b>obs</b>'));
});

// ======================= a ficha da pessoa =======================
const ficha = (c, id = 'a') => (rodar(c, `_psFichaAberta = ${J(id)}`), quadro(c));

test('a ficha mostra os dados, o histórico e a etapa; trocar de etapa lista as outras (sem a atual)', () => {
  const c = ctx();
  cenario(c, {
    candidatos: [
      cand({
        id: 'a',
        nome: 'Ana',
        email: 'ana@x.com',
        telefone: '11 9',
        origem: 'LinkedIn',
        curriculo: 'Dez anos em vendas',
        etapa: 'triagem',
        perfil: { maior18: true, cidadeAtual: 'Recife' },
        historico: [{ de: 'nova', para: 'triagem', em: '2026-10-02T12:00:00Z', observacao: 'ok' }],
      }),
    ],
  });
  assert.ok(
    ficha(c).includes('Ver perfil do candidato') && !ficha(c).includes('Recife'),
    'o perfil começa recolhido atrás do botão'
  );
  rodar(c, "_rsPerfilExpandido = 'a'");
  const h = ficha(c);
  assert.ok(h.includes('ana@x.com') && h.includes('11 9') && h.includes('Origem: LinkedIn'));
  assert.ok(h.includes('Dez anos em vendas') && h.includes('Recife'));
  assert.ok(h.includes('Etapa: Triagem dos currículos'));
  assert.ok(h.includes('Nova candidatura → Triagem dos currículos'));
  const opcoes = [...h.matchAll(/<option value="(\w+)">/g)].map((m) => m[1]).filter((v) => ETAPAS_TODAS.includes(v));
  assert.ok(opcoes.length === 13 && !opcoes.includes('triagem'), 'as outras 13 etapas, sem a atual');
  assert.ok(h.includes('fecharFichaRS()'));
});

test('a ficha traz a AÇÃO de cada etapa: vídeo, prova prática, DISC/GALT, etapas internas, entrevistas, escolha, proposta e aprovado', () => {
  const c = ctx('owner');
  const reqs = [
    {
      id: 'v1',
      codigo: 'REQ-001',
      cargoId: 'cg',
      status: 'aprovada',
      etapasConfig: {
        prova_pratica: {
          instrucoes: 'Monte uma proposta comercial.',
          prazoDias: 5,
          criterios: [{ descricao: 'Clareza', peso: 4 }],
          links: [{ rotulo: 'Briefing', url: 'https://exemplo.com/b' }],
        },
      },
    },
  ];
  const em = (etapa, extra) => {
    cenario(c, { requisicoes: reqs, candidatos: [cand({ id: 'a', nome: 'Ana', etapa, ...extra })], videos: [] });
    return ficha(c);
  };
  assert.ok(em('video').includes('Vídeo de apresentação') && em('video').includes('Pedir vídeo'));
  const pp = em('prova_pratica');
  assert.ok(
    pp.includes('Monte uma proposta comercial.') &&
      pp.includes('Prazo de entrega: 5 dia(s)') &&
      pp.includes('Clareza') &&
      pp.includes('só você vê') &&
      pp.includes('Briefing')
  );
  assert.ok(em('disc_galt').includes('feitos fora do sistema'));
  for (const e of ['redes_sociais', 'checagem_curriculo'])
    assert.ok(em(e).includes('Etapa só sua') && em(e).includes('não recebe e-mail'), e);
  for (const e of ['entrevista_fit', 'entrevista_final']) {
    const h = em(e);
    assert.ok(
      h.includes('preencha o scorecard') && /<details[^>]*open[^>]*>\s*<summary[^>]*>Scorecards de entrevista/.test(h),
      e
    );
  }
  assert.ok(em('escolha').includes('Compare os finalistas'));
  assert.ok(em('proposta').includes('Faça a proposta'));
  assert.ok(em('aprovado').includes('Converta em colaborador'));
});

test('prova prática sem enunciado: a ficha avisa onde definir; reprovado: só "Reabrir", sem ação de etapa', () => {
  const c = ctx();
  cenario(c, { candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'prova_pratica' })] });
  assert.ok(ficha(c).includes('ainda não tem a prova prática definida') && ficha(c).includes('Configurar esta vaga'));
  cenario(c, { candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'prova_pratica', reprovado: true })] });
  const h = ficha(c);
  assert.ok(
    h.includes('Reprovado(a) / desistiu') &&
      h.includes("reabrirCandidatoRS('a')") &&
      !h.includes('ainda não tem a prova prática') &&
      !h.includes('Mover para outra etapa')
  );
});

// ======================= faixa, formulário e a tela =======================
test('a faixa "Para você fazer agora" lista as pendências clicáveis; sem pendência, diz que está tudo em dia', () => {
  const c = ctx('rh');
  cenario(c, {
    requisicoes: [
      { id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada' },
      { id: 'v2', codigo: 'R2', cargoId: 'cg', status: 'pendente' },
    ],
    candidatos: [cand({ id: 'a', nome: 'Ana', etapa: 'nova' })],
  });
  const h = rodar(c, 'faixaPendenciasHtml(true)');
  assert.ok(h.includes('1 vaga(s) para aprovar') && h.includes('1 candidato(s) para triar'));
  assert.ok(h.includes("resolverPendenciaRS('aprovar', null)") && h.includes("resolverPendenciaRS('triar', 'v1')"));
  assert.ok(!rodar(c, 'faixaPendenciasHtml(false)').includes('para aprovar'));
  cenario(c, {
    requisicoes: [{ id: 'v1', codigo: 'R1', cargoId: 'cg', status: 'aprovada', etapasAtivas: ['triagem'] }],
    candidatos: [],
  });
  assert.ok(rodar(c, 'faixaPendenciasHtml(true)').includes('Nada pendente agora'));
});

test('FORMULÁRIO DA VAGA SIMPLIFICADO: o essencial à vista; perfil, remuneração e requisitos em "Mais detalhes"; modelo de processo; etapas só em "Ajustar"', () => {
  const c = ctx('rh');
  cenario(c, {});
  rodar(
    c,
    "_rsNovaRequisicaoAberta = true; state.cargos = [{ id: 'cg', nome: 'Vendedor', desenho: { aprovado: true } }];"
  );
  const h = rodar(c, 'rsRequisicoesCardHtml()');
  const detalhes = [...h.matchAll(/<details[\s\S]*?<\/details>/g)].map((m) => m[0]);
  assert.equal(detalhes.length, 2, 'só dois blocos recolhidos no formulário');
  const [mais, ajustar] = detalhes;
  assert.ok(
    mais.includes('Mais detalhes da vaga') &&
      ['rs_req_confidencial', 'rs_req_salario', 'rs_req_hard', 'rs_req_moto', 'rs_req_excel'].every((id) =>
        mais.includes(`id="${id}"`)
      )
  );
  assert.ok(
    ajustar.includes('Ajustar as etapas deste processo') && (ajustar.match(/class="rs-req-etapa"/g) || []).length === 11
  );
  const visivel = h.replace(mais, '').replace(ajustar, '');
  for (const id of ['rs_req_cargo', 'rs_req_qtd', 'rs_req_prazo', 'rs_req_modelo'])
    assert.ok(visivel.includes(`id="${id}"`), `${id} precisa ficar à vista`);
  for (const id of ['rs_req_salario', 'rs_req_hard', 'rs_req_moto'])
    assert.ok(!visivel.includes(`id="${id}"`), `${id} precisa ficar recolhido`);
  assert.ok(
    visivel.includes('aplicarModeloProcessoRS(this.value)') &&
      visivel.includes('Enxuto') &&
      visivel.includes('Operacional')
  );
});

test('a tabela das vagas abre o QUADRO (botão "Abrir quadro") e não carrega mais o funil dentro da tabela', () => {
  const c = ctx('rh');
  cenario(c, {
    requisicoes: [
      {
        id: 'v1',
        codigo: 'REQ-001',
        cargoId: 'cg',
        quantidade: 1,
        status: 'aprovada',
        publicada: true,
        vagaPublicaId: 'p1',
      },
    ],
    candidatos: [cand({ id: 'a', nome: 'Ana' }), cand({ id: 'b', nome: 'Bia' })],
  });
  const h = rodar(c, 'rsRequisicoesCardHtml()');
  assert.ok(h.includes("selecionarVagaRS('v1')") && h.includes('Abrir quadro (2)'));
  assert.ok(!h.includes('Candidatos —') && !h.includes('<th>Candidato</th>') && !h.includes('moverEtapaCandidatoRS'));
});

test('a tela do Processo seletivo mostra o quadro da vaga escolhida, a configuração recolhida com o aviso da prova prática e o seletor de vaga', () => {
  const c = ctx('rh');
  cenario(c, {
    requisicoes: [
      { id: 'v1', codigo: 'REQ-001', cargoId: 'cg', quantidade: 1, status: 'aprovada' },
      { id: 'v2', codigo: 'REQ-002', cargoId: 'cg', quantidade: 1, status: 'aprovada', encerrada: true },
    ],
    candidatos: [cand({ id: 'a', nome: 'Ana Souza', etapa: 'triagem' })],
  });
  const h = rodar(c, 'pageProcessoSeletivoRS()');
  assert.ok(h.includes('Ana Souza') && h.includes('Avançar →') && h.includes('1. Entrada'));
  assert.ok(
    h.includes('REQ-001 — Vendedor') &&
      h.includes('REQ-002 — Vendedor (encerrada)') &&
      h.includes('selecionarVagaRS(this.value)')
  );
  assert.ok(/Configurar esta vaga[\s\S]*?prova prática pendente/.test(h));
  assert.ok(h.includes('iniciarNovaVagaRS()'));
  rodar(c, "_rsRequisicaoExpandida = 'v2'");
  assert.ok(!rodar(c, 'pageProcessoSeletivoRS()').includes('Ana Souza'), 'o quadro é só da vaga escolhida');
});

test('"+ Nova vaga" abre a seção das vagas já com o formulário aberto', () => {
  const c = ctx();
  cenario(c, {});
  rodar(c, 'iniciarNovaVagaRS()');
  assert.equal(rodar(c, '_psVagasAberto'), true);
  assert.equal(rodar(c, '_rsNovaRequisicaoAberta'), true);
  assert.ok(c.__renders >= 1);
});

test('integração: o quadro reutiliza o movimento de etapa (sem duplicar regras) e está no app; a tabela antiga de candidatos saiu', () => {
  const q = ler('js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js');
  assert.ok(/moverEtapaCandidatoRS\(candidatoId, proxima\.id\)/.test(q));
  assert.ok(!/historico\.push|enviarEmailEtapaRS/.test(q), 'o quadro não pode reimplementar o movimento');
  assert.ok(ler('app.html').includes('js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js'));
  const rs = ler('js/40-page-rs.js');
  assert.ok(!rs.includes('<th>Candidato</th>') && rs.includes('quadroDaVagaHtml(vaga)'));
  assert.ok(ler('js/44-page-processo-seletivo.js').includes('faixaPendenciasHtml(gestor)'));
});
