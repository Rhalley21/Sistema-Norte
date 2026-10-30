// =========================================================================
// Relatórios do recrutamento (js/54-rs-relatorios.js). Os cenários usam DATAS FIXAS e dias redondos, então cada número
// esperado pode ser conferido à mão: funil (quem chegou a cada etapa), tempo por etapa (média e mediana só do que já
// terminou; quem ainda está lá conta à parte e vira "parado" depois de 7 dias), origem, reprovações, exportação.
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

const DIA = 86400000;
const BASE = Date.parse('2026-10-01T12:00:00Z');
const iso = (dia) => new Date(BASE + dia * DIA).toISOString();
const AGORA = BASE + 30 * DIA; // "hoje" nos cenários: dia 30

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
    'js/54-rs-relatorios.js',
  ]);
  Object.assign(c, {
    meuPapelReal: papel,
    meuPerfilId: 'p1',
    URL,
    __gotos: [],
    __auditoria: [],
    __renders: 0,
    __baixados: [],
    __toasts: [],
  });
  c.goto = (id) => c.__gotos.push(id);
  c.render = () => c.__renders++;
  c.showToast = (t) => c.__toasts.push(t);
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.setTimeout = setTimeout;
  c.sb = { functions: { invoke: async () => ({ data: {}, error: null }) } };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const mov = (de, para, dia, observacao) => ({ de, para, em: iso(dia), ...(observacao ? { observacao } : {}) });
const cand = (id, extra) => ({
  id,
  vagaId: 'v1',
  nome: `Cand ${id}`,
  origem: 'LinkedIn',
  etapa: 'nova',
  reprovado: false,
  historico: [],
  ...extra,
});
const VAGA = { id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', publicada: true, publicadaEm: iso(0) };
const montar = (c, candidatos, extra = {}) =>
  plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: [VAGA], candidatos, cargos: [{ id: 'cg', nome: 'Vendedor' }], vagaId: null, dias: 0, agora: AGORA, ...extra })})`
    )
  );
const fn = (c, expr) => plano(rodar(c, expr));

// ======================= etapas alcançadas =======================
test('etapas alcançadas: as do histórico mais a atual; "reprovado" e nulos não são etapa', () => {
  const c = ctx();
  const alc = (x) => [...rodar(c, `etapasAlcancadasRS(${J(x)})`)].sort();
  assert.deepEqual(alc({ etapa: 'triagem', historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 1)] }), [
    'nova',
    'triagem',
  ]);
  assert.deepEqual(alc({ etapa: 'triagem', historico: [mov('triagem', 'reprovado', 3), { para: null }] }), ['triagem']);
  assert.deepEqual(alc({ historico: undefined, etapa: null }), []);
  assert.deepEqual(alc({ etapa: 'video', historico: [] }), ['video'], 'sem histórico vale a etapa atual');
});

test('data de entrada: a mais antiga entre criação e histórico; datas inválidas são ignoradas; sem nada, nulo', () => {
  const c = ctx();
  const e = (x) => rodar(c, `dataEntradaCandidatoRS(${J(x)})`);
  assert.equal(e({ criadoEm: iso(5), historico: [mov(null, 'nova', 3)] }), BASE + 3 * DIA);
  assert.equal(e({ criadoEm: 'lixo', historico: [{ em: 'x' }, mov(null, 'nova', 9)] }), BASE + 9 * DIA);
  assert.equal(e({ historico: [] }), null);
});

// ======================= funil =======================
const CENARIO_FUNIL = [
  cand('a', {
    etapa: 'aprovado',
    convertidoEm: iso(25),
    historico: [
      mov(null, 'nova', 0),
      mov('nova', 'triagem', 1),
      mov('triagem', 'entrevista_final', 4),
      mov('entrevista_final', 'proposta', 8),
      mov('proposta', 'aprovado', 9),
    ],
  }),
  cand('b', {
    etapa: 'entrevista_final',
    historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 2), mov('triagem', 'entrevista_final', 6)],
  }),
  cand('c', {
    etapa: 'triagem',
    reprovado: true,
    historico: [mov(null, 'nova', 1), mov('nova', 'triagem', 3), mov('triagem', 'reprovado', 5, 'sem perfil')],
  }),
  cand('d', { etapa: 'nova', historico: [mov(null, 'nova', 10)] }),
];

test('funil geral: quantos chegaram a cada etapa, % do total e % da etapa anterior; reprovado continua contando onde chegou', () => {
  const c = ctx();
  const r = montar(c, CENARIO_FUNIL);
  assert.deepEqual(
    r.funil.etapas.map((e) => [e.id, e.chegaram]),
    [
      ['nova', 4],
      ['triagem', 3],
      ['entrevista_final', 2],
      ['proposta', 1],
      ['aprovado', 1],
    ]
  );
  assert.deepEqual(
    r.funil.etapas.map((e) => e.pctDoTotal),
    [100, 75, 50, 25, 25]
  );
  assert.deepEqual(
    r.funil.etapas.map((e) => e.pctDaAnterior),
    [null, 75, 67, 50, 100]
  );
  assert.deepEqual([r.funil.total, r.funil.reprovados, r.funil.contratados], [4, 1, 1]);
});

test('funil geral: etapas que ninguém alcançou não aparecem (a "nova" sempre aparece)', () => {
  const c = ctx();
  const r = montar(c, [cand('a', { etapa: 'nova', historico: [mov(null, 'nova', 0)] })]);
  assert.deepEqual(
    r.funil.etapas.map((e) => e.id),
    ['nova']
  );
  assert.deepEqual(
    montar(c, []).funil.etapas.map((e) => e.id),
    ['nova']
  );
});

test('funil de UMA vaga: mostra só as etapas que a vaga usa, na ordem da vaga', () => {
  const c = ctx();
  const vaga = { ...VAGA, etapasAtivas: ['triagem', 'entrevista_final'] };
  const r = plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: [vaga], candidatos: CENARIO_FUNIL, cargos: [], vagaId: 'v1', dias: 0, agora: AGORA })})`
    )
  );
  const esperado = plano(rodar(c, `etapasAtivasDaVagaRS(${J(vaga)}).map((e) => e.id)`));
  assert.deepEqual(
    r.funil.etapas.map((e) => e.id),
    esperado
  );
  assert.ok(!r.funil.etapas.some((e) => e.id === 'video' || e.id === 'disc_galt'), 'etapas desligadas não entram');
  assert.equal(r.funil.etapas.find((e) => e.id === 'triagem').chegaram, 3);
});

test('quem pulou etapas (movido direto) conta só onde esteve; o funil pode não ser decrescente e não quebra', () => {
  const c = ctx();
  const r = montar(c, [
    cand('a', { etapa: 'prova_pratica', historico: [mov(null, 'nova', 0), mov('nova', 'prova_pratica', 2)] }),
  ]);
  assert.deepEqual(
    r.funil.etapas.map((e) => [e.id, e.chegaram]),
    [
      ['nova', 1],
      ['prova_pratica', 1],
    ]
  );
});

// ======================= tempo por etapa =======================
test('tempo por etapa: média e mediana só dos movimentos CONCLUÍDOS (conferido à mão)', () => {
  const c = ctx();
  // nova: a=2d (0→2), b=1d (1→2), x=4d (0→4) -> média 2,3; mediana 2. triagem: a=3d (2→5), b=10d (2→12) -> média 6,5; mediana 6,5
  const lista = [
    cand('a', {
      etapa: 'disc_galt',
      historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 2), mov('triagem', 'disc_galt', 5)],
    }),
    cand('b', {
      etapa: 'disc_galt',
      historico: [mov(null, 'nova', 1), mov('nova', 'triagem', 2), mov('triagem', 'disc_galt', 12)],
    }),
    cand('x', { etapa: 'triagem', historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 4)] }),
  ];
  const t = montar(c, lista).tempo.etapas;
  const nova = t.find((e) => e.id === 'nova');
  assert.deepEqual([nova.amostras, nova.mediaDias, nova.medianaDias], [3, 2.3, 2]);
  const triagem = t.find((e) => e.id === 'triagem');
  assert.deepEqual([triagem.amostras, triagem.mediaDias, triagem.medianaDias], [2, 6.5, 6.5]);
});

test('quem AINDA está na etapa não entra na média; conta em "estão agora" e, passando de 7 dias, vira parado', () => {
  const c = ctx();
  const lista = [
    cand('velho', { etapa: 'disc_galt', historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 5)] }), // 25 dias parado
    cand('recente', { etapa: 'disc_galt', historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 27)] }), // 3 dias
    cand('limite', {
      etapa: 'disc_galt',
      historico: [mov(null, 'nova', 0), { de: 'nova', para: 'disc_galt', em: new Date(AGORA - 7 * DIA).toISOString() }],
    }), // exatamente 7 dias: ainda não
    cand('quase', {
      etapa: 'disc_galt',
      historico: [
        mov(null, 'nova', 0),
        { de: 'nova', para: 'disc_galt', em: new Date(AGORA - 7 * DIA - 3600000).toISOString() },
      ],
    }), // 7 dias e 1 hora
  ];
  const t = montar(c, lista).tempo;
  const disc = t.etapas.find((e) => e.id === 'disc_galt');
  assert.deepEqual(
    [disc.amostras, disc.mediaDias, disc.emAndamento, disc.parados],
    [0, null, 4, 2],
    'nenhum concluído; 4 estão lá; 2 parados'
  );
  assert.deepEqual(
    t.parados.map((p) => [p.candidatoId, p.dias]),
    [
      ['velho', 25],
      ['quase', 7],
    ],
    'os mais antigos primeiro'
  );
  assert.equal(t.parados[0].nomeEtapa, plano(rodar(c, "etapaNomeRS('disc_galt')")));
});

test('quem foi contratado ou está "aprovado" não é parado; quem foi reprovado não está "em andamento"', () => {
  const c = ctx();
  const lista = [
    cand('contratado', {
      etapa: 'aprovado',
      convertidoEm: iso(20),
      historico: [mov(null, 'nova', 0), mov('nova', 'aprovado', 2)],
    }),
    cand('aprovadoSemConverter', { etapa: 'aprovado', historico: [mov(null, 'nova', 0), mov('nova', 'aprovado', 2)] }),
    cand('reprovado', {
      etapa: 'triagem',
      reprovado: true,
      historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 1), mov('triagem', 'reprovado', 3)],
    }),
  ];
  const t = montar(c, lista).tempo;
  assert.deepEqual(t.parados, []);
  assert.ok(!t.etapas.some((e) => e.id === 'aprovado'));
  assert.equal(t.etapas.find((e) => e.id === 'triagem').emAndamento, 0);
  assert.equal(
    t.etapas.find((e) => e.id === 'triagem').amostras,
    1,
    'o tempo até a reprovação (2 dias) é um caso concluído'
  );
});

test('"Reabrir": o novo registro recomeça a contagem na etapa; sem o registro (dado antigo) o candidato não conta como em andamento', () => {
  const c = ctx();
  const comRegistro = cand('a', {
    etapa: 'triagem',
    historico: [
      mov(null, 'nova', 0),
      mov('nova', 'triagem', 2),
      mov('triagem', 'reprovado', 10),
      mov('reprovado', 'triagem', 25),
    ],
  });
  const t = montar(c, [comRegistro]).tempo.etapas.find((e) => e.id === 'triagem');
  assert.deepEqual(
    [t.amostras, t.mediaDias, t.emAndamento],
    [1, 8, 1],
    'triagem: 8 dias até reprovar + de novo em andamento desde o dia 25'
  );
  const antigo = cand('b', {
    etapa: 'triagem',
    reprovado: false,
    historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 2), mov('triagem', 'reprovado', 10)],
  });
  const t2 = montar(c, [antigo]).tempo.etapas.find((e) => e.id === 'triagem');
  assert.deepEqual([t2.amostras, t2.emAndamento], [1, 0]);
});

test('dados ruins não quebram: datas inválidas, movimentos fora de ordem, tempo negativo, sem histórico e destino nulo', () => {
  const c = ctx();
  const lista = [
    cand('a', { etapa: 'triagem', historico: [mov('nova', 'triagem', 5), mov(null, 'nova', 0)] }), // fora de ordem: o relatório ordena
    cand('b', {
      etapa: 'triagem',
      historico: [{ para: 'nova', em: 'lixo' }, { para: null, em: iso(1) }, mov('nova', 'triagem', 2)],
    }),
    cand('c', { etapa: 'nova', historico: undefined }),
    cand('d', { etapa: 'triagem', historico: [mov(null, 'nova', 9), { de: 'nova', para: 'triagem', em: iso(9) }] }), // 0 dia
  ];
  const t = montar(c, lista).tempo.etapas.find((e) => e.id === 'nova');
  assert.deepEqual([t.amostras, t.mediaDias], [2, 2.5], 'a: 5 dias; d: 0 dia');
});

// ======================= origem =======================
test('origem: agrupa ignorando maiúsculas, acento e espaços; mostra "Sem origem"; conta decisão, contratados e reprovados; ordena por quantidade', () => {
  const c = ctx();
  const lista = [
    cand('1', { origem: 'LinkedIn', etapa: 'proposta', historico: [mov(null, 'nova', 0), mov('nova', 'proposta', 3)] }),
    cand('2', {
      origem: ' linkedin ',
      etapa: 'aprovado',
      convertidoEm: iso(20),
      historico: [mov(null, 'nova', 0), mov('nova', 'escolha', 3)],
    }),
    cand('3', { origem: 'Indicação', etapa: 'triagem', reprovado: true, historico: [mov(null, 'nova', 0)] }),
    cand('4', { origem: 'indicacao', etapa: 'nova' }),
    cand('5', { origem: 'INDICAÇÃO', etapa: 'nova' }),
    cand('6', { origem: '', etapa: 'nova' }),
    cand('7', { origem: undefined, etapa: 'nova' }),
  ];
  const o = montar(c, lista).origem;
  assert.deepEqual(
    o.map((x) => [x.origem, x.total, x.naDecisao, x.contratados, x.reprovados]),
    [
      ['Indicação', 3, 0, 0, 1],
      ['LinkedIn', 2, 2, 1, 0],
      ['Sem origem', 2, 0, 0, 0],
    ]
  );
});

// ======================= reprovações =======================
test('reprovações: por etapa em que saíram e por motivo (agrupado sem diferenciar maiúscula/acento); sem motivo informado; só os reprovados de verdade', () => {
  const c = ctx();
  const lista = [
    cand('1', { etapa: 'triagem', reprovado: true, historico: [mov('triagem', 'reprovado', 5, 'Sem perfil')] }),
    cand('2', { etapa: 'triagem', reprovado: true, historico: [mov('triagem', 'reprovado', 5, 'sem  PERFIL ')] }),
    cand('3', {
      etapa: 'entrevista_final',
      reprovado: true,
      historico: [mov('entrevista_final', 'reprovado', 9, 'Desistiu')],
    }),
    cand('4', { etapa: 'video', reprovado: true, historico: [mov('video', 'reprovado', 9, '')] }),
    cand('5', {
      etapa: 'triagem',
      reprovado: false,
      historico: [mov('triagem', 'reprovado', 5, 'Foi reaberto'), mov('reprovado', 'triagem', 8, 'Reaberto')],
    }),
    cand('6', { etapa: 'video', reprovado: true, historico: [] }), // reprovado sem registro: usa a etapa atual
  ];
  const r = montar(c, lista).reprovacoes;
  assert.equal(r.total, 5);
  assert.deepEqual(
    r.porEtapa.map((x) => [x.id, x.total]),
    [
      ['triagem', 2],
      ['video', 2],
      ['entrevista_final', 1],
    ]
  );
  assert.deepEqual(
    r.motivos.map((m) => [m.motivo, m.total]),
    [
      ['Sem motivo informado', 2],
      ['Sem perfil', 2],
      ['Desistiu', 1],
    ]
  );
});

test('motivos de reprovação: só os 10 mais frequentes', () => {
  const c = ctx();
  const lista = Array.from({ length: 15 }, (_, i) =>
    cand(`r${i}`, { etapa: 'triagem', reprovado: true, historico: [mov('triagem', 'reprovado', 5, `Motivo ${i}`)] })
  );
  assert.equal(montar(c, lista).reprovacoes.motivos.length, 10);
});

// ======================= resumo, tempo de contratação e aceite =======================
test('resumo: tempo de contratação e taxa de aceite batem com o indicador que já existe no Processo seletivo', () => {
  const c = ctx();
  const lista = [
    cand('a', {
      etapa: 'aprovado',
      convertidoEm: iso(20),
      historico: [mov(null, 'nova', 0), mov('proposta', 'proposta', 8), mov('proposta', 'aprovado', 9)],
    }),
    cand('b', {
      etapa: 'triagem',
      reprovado: true,
      historico: [mov(null, 'nova', 0), mov('x', 'proposta', 7), mov('proposta', 'reprovado', 12)],
    }),
  ];
  const r = montar(c, lista);
  assert.deepEqual(
    [r.resumo.tempoContratacaoDias, r.resumo.tempoContratacaoAmostras, r.resumo.taxaAceite, r.resumo.propostas],
    [20, 1, 50, 2]
  );
  rodar(c, `state.cargos = []; state.rs = { requisicoes: [${J(VAGA)}], candidatos: ${J(lista)}, configEtapas: {} };`);
  const kpis = rodar(c, 'renderIndicadoresRS()');
  assert.ok(kpis.includes('20 dias') && kpis.includes('50%'), 'o indicador antigo mostra os mesmos números');
});

test('resumo: contagens de vagas, candidatos, em andamento, reprovados e contratados; sem propostas o aceite é nulo', () => {
  const c = ctx();
  const reqs = [VAGA, { ...VAGA, id: 'v2', codigo: 'REQ-002', encerrada: true }, { id: 'v3', status: 'pendente' }];
  const lista = [
    cand('a'),
    cand('b', { reprovado: true }),
    cand('d', { etapa: 'aprovado', convertidoEm: iso(5) }),
    cand('e', { vagaId: null }),
  ];
  const r = plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: reqs, candidatos: lista, cargos: [], vagaId: null, dias: 0, agora: AGORA })})`
    )
  );
  assert.deepEqual(
    [
      r.resumo.vagas,
      r.resumo.vagasAbertas,
      r.resumo.candidatos,
      r.resumo.ativos,
      r.resumo.reprovados,
      r.resumo.contratados,
    ],
    [2, 1, 3, 2, 1, 1]
  );
  assert.equal(r.resumo.taxaAceite, null);
  assert.equal(r.resumo.tempoContratacaoDias, 5, 'publicada no dia 0 e contratado no dia 5');
  const semDatas = plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: [{ ...VAGA, publicadaEm: undefined }], candidatos: [cand('d', { etapa: 'aprovado', convertidoEm: iso(5) })], cargos: [], vagaId: null, dias: 0, agora: AGORA })})`
    )
  );
  assert.equal(semDatas.resumo.tempoContratacaoDias, null, 'sem data de publicação não há como medir');
});

test('por vaga: números de cada vaga aprovada, com cargo, situação e parados', () => {
  const c = ctx();
  const lista = [
    cand('a', { etapa: 'disc_galt', historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 5)] }),
    cand('b', { reprovado: true }),
    cand('c', { vagaId: 'v2' }),
  ];
  const reqs = [
    VAGA,
    { id: 'v2', codigo: 'REQ-002', cargoId: 'cg', status: 'aprovada', encerrada: true },
    { id: 'v3', codigo: 'REQ-003', status: 'pendente' },
  ];
  const r = plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: reqs, candidatos: lista, cargos: [{ id: 'cg', nome: 'Vendedor' }], vagaId: null, dias: 0, agora: AGORA })})`
    )
  );
  assert.deepEqual(
    r.vagas.map((v) => [v.codigo, v.cargo, v.situacao, v.candidatos, v.ativos, v.reprovados, v.parados]),
    [
      ['REQ-001', 'Vendedor', 'Aberta e publicada', 2, 1, 1, 1],
      ['REQ-002', 'Vendedor', 'Encerrada', 1, 1, 0, 0],
    ]
  );
});

// ======================= filtros =======================
test('filtro de vaga: só os candidatos daquela vaga em todos os blocos', () => {
  const c = ctx();
  const lista = [cand('a', { vagaId: 'v1' }), cand('b', { vagaId: 'v2' }), cand('d', { vagaId: 'v2' })];
  const reqs = [VAGA, { ...VAGA, id: 'v2', codigo: 'REQ-002' }];
  const r = plano(
    rodar(
      c,
      `montarRelatorioRS(${J({ requisicoes: reqs, candidatos: lista, cargos: [], vagaId: 'v2', dias: 0, agora: AGORA })})`
    )
  );
  assert.deepEqual([r.resumo.candidatos, r.resumo.vagas, r.funil.total, r.vagas.length], [2, 1, 2, 1]);
});

test('filtro de período: pela data de entrada (limite incluído); sem data fica de fora e é contado', () => {
  const c = ctx();
  const lista = [
    cand('dentro', { historico: [mov(null, 'nova', 10)] }), // exatamente 20 dias antes de "hoje" (dia 30)
    cand('fora', { historico: [mov(null, 'nova', 9)] }),
    cand('semData', { historico: [] }),
  ];
  const r20 = montar(c, lista, { dias: 20 });
  assert.deepEqual([r20.resumo.candidatos, r20.filtro.semData], [1, 1]);
  assert.equal(montar(c, lista, { dias: 21 }).resumo.candidatos, 2);
  assert.equal(montar(c, lista, { dias: 0 }).resumo.candidatos, 3, 'sem período: todos, inclusive sem data');
});

test('candidatos sem vaga (só cadastrados) nunca entram nos relatórios', () => {
  const c = ctx();
  assert.equal(montar(c, [cand('a', { vagaId: null }), cand('b', { vagaId: '' })]).resumo.candidatos, 0);
});

// ======================= exportação =======================
test('CSV: BOM, ";" e quebras CRLF; vírgula decimal; aspas e ";" dentro do texto protegidos', () => {
  const c = ctx();
  const cel = (v) => rodar(c, `celulaCsvRelatorioRS(${J(v)})`);
  assert.equal(cel('simples'), 'simples');
  assert.equal(cel('a;b'), '"a;b"');
  assert.equal(cel('diz "oi"'), '"diz ""oi"""');
  assert.equal(cel('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(cel(1.5), '1,5');
  assert.equal(cel(0), '0');
  assert.equal(cel(-2), '-2', 'número negativo de verdade não é fórmula');
  assert.equal(cel(null), '');
  assert.equal(cel(undefined), '');
});

test('CSV: texto que o Excel leria como FÓRMULA ganha uma aspa na frente (injeção em planilha)', () => {
  const c = ctx();
  const cel = (v) => rodar(c, `celulaCsvRelatorioRS(${J(v)})`);
  assert.equal(cel('=SOMA(A1:A2)'), "'=SOMA(A1:A2)");
  assert.equal(cel('+55 11 99999'), "'+55 11 99999");
  assert.equal(cel('-1+1'), "'-1+1");
  assert.equal(cel('@usuario'), "'@usuario");
  assert.equal(cel('\tabc'), "'\tabc");
  assert.equal(cel('=HYPERLINK("http://x";"clique")'), '"\'=HYPERLINK(""http://x"";""clique"")"');
});

test('CSV completo: todas as seções, os números do cenário e nenhuma fórmula solta', () => {
  const c = ctx();
  const lista = [
    ...CENARIO_FUNIL,
    cand('hack', { origem: '=HYPERLINK("http://x")', historico: [mov(null, 'nova', 1)] }),
  ];
  const csv = rodar(c, `relatorioParaCsvRS(${J(montar(c, lista))})`);
  assert.ok(csv.startsWith('\ufeffRelatório do recrutamento\r\n'));
  assert.ok(!/(^|\r\n)[^"\r\n]*\n/.test(csv.replace(/"[^"]*"/g, '')), 'só CRLF fora das aspas');
  for (const s of [
    'RESUMO',
    'FUNIL',
    'TEMPO EM CADA ETAPA',
    'ORIGEM DOS CANDIDATOS',
    'REPROVAÇÕES POR ETAPA',
    'MOTIVOS DE REPROVAÇÃO (texto livre)',
    'POR VAGA',
  ])
    assert.ok(csv.includes(`\r\n${s}\r\n`), s);
  assert.ok(csv.includes('Etapa;Chegaram;% do total;% da etapa anterior'));
  assert.ok(csv.includes('Nova candidatura;5;100;') || /;5;100;/.test(csv));
  assert.ok(csv.includes('"\'=HYPERLINK(""http://x"")"'), 'a origem maliciosa saiu protegida');
  assert.ok(!/(^|;)=/m.test(csv.replace(/"[^"]*"/g, '')), 'nenhuma célula começa com = fora de aspas');
  assert.ok(csv.includes('REQ-001;Vendedor;Aberta e publicada;'));
});

test('exportar: baixa um arquivo .csv com a data no nome e audita só os totais (nunca nomes)', () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = []; state.rs = { requisicoes: [${J(VAGA)}], candidatos: ${J(CENARIO_FUNIL)}, configEtapas: {} }; _rsRelatorioFiltro = { vagaId: '', dias: 0 };`
  );
  c.Blob = function (partes, opcoes) {
    this.partes = partes;
    this.opcoes = opcoes;
  };
  c.URL = { createObjectURL: (b) => (c.__baixados.push(b), 'blob:x'), revokeObjectURL() {} };
  c.document.createElement = () => ({
    click() {
      c.__baixados.push('clicou');
    },
    remove() {},
    set href(v) {},
    set download(v) {
      c.__baixados.push(v);
    },
  });
  c.document.body = { appendChild() {} };
  rodar(c, 'exportarRelatorioRS()');
  assert.ok(
    c.__baixados.some((x) => /^relatorio-recrutamento-\d{4}-\d{2}-\d{2}\.csv$/.test(x)) &&
      c.__baixados.includes('clicou')
  );
  assert.equal(c.__baixados[0].opcoes.type, 'text/csv;charset=utf-8');
  assert.deepEqual(plano(c.__auditoria), [['rs.relatorio_exportado', { candidatos: 4, vagas: 1 }]]);
  assert.ok(!J(c.__auditoria).includes('Cand '));
});

// ======================= a tela =======================
function cenarioTela(c, candidatos = CENARIO_FUNIL, extra = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = []; state.rs = { requisicoes: [${J({ ...VAGA, ...extra })}], candidatos: ${J(candidatos)}, configEtapas: {} }; _rsRelatorioFiltro = { vagaId: '', dias: 0 };`
  );
}

test('acesso: só Administrador e RH; líder e colaborador veem recusa', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenarioTela(c);
    assert.ok(rodar(c, 'pageRelatoriosRS()').includes('Você não tem acesso'), String(papel));
  }
  for (const papel of ['owner', 'rh']) {
    const c = ctx(papel);
    cenarioTela(c);
    assert.ok(rodar(c, 'pageRelatoriosRS()').includes('R&S — Relatórios'), papel);
  }
});

test('a tela mostra os números, o funil com barras, os filtros e o botão de exportar; tabelas com legenda e cabeçalhos para leitor de tela', () => {
  const c = ctx();
  cenarioTela(c);
  const h = rodar(c, 'pageRelatoriosRS()');
  for (const t of [
    'Funil',
    'Tempo em cada etapa',
    'Origem dos candidatos',
    'Reprovações',
    'Por vaga',
    'Exportar para planilha (CSV)',
    'Todas as vagas',
    'Todo o período',
    'Últimos 30 dias',
    'REQ-001 — Vendedor',
  ])
    assert.ok(h.includes(t), t);
  assert.ok(/<label for="rs_rel_vaga"/.test(h) && /<label for="rs_rel_dias"/.test(h));
  assert.ok((h.match(/<caption class="sr-only">/g) || []).length >= 4);
  assert.ok(!/<th>/.test(h) && /<th scope="col">/.test(h));
  assert.ok(h.includes('aria-hidden="true"'), 'as barras são só visuais: os números estão no texto');
  assert.ok(h.includes('sem perfil'), 'o motivo da reprovação aparece');
});

test('amostra pequena é sinalizada ("poucos dados"); amostra de 5 ou mais não', () => {
  const c = ctx();
  const lista = Array.from({ length: 5 }, (_, i) =>
    cand(`x${i}`, { etapa: 'triagem', historico: [mov(null, 'nova', 0), mov('nova', 'triagem', 2)] })
  );
  cenarioTela(c, lista.slice(0, 4));
  assert.ok(rodar(c, 'pageRelatoriosRS()').includes('poucos dados'));
  cenarioTela(c, lista);
  assert.ok(!rodar(c, 'pageRelatoriosRS()').includes('poucos dados'));
});

test('candidatos parados: lista com "Abrir ficha", que abre a vaga e a ficha no Processo seletivo', () => {
  const c = ctx();
  cenarioTela(c, [
    cand('p1', {
      nome: 'Parada Ana',
      etapa: 'disc_galt',
      historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 5)],
    }),
  ]);
  const h = rodar(c, 'pageRelatoriosRS()');
  assert.ok(
    h.includes('Candidatos parados') &&
      h.includes('Parada Ana') &&
      h.includes("abrirCandidatoDoRelatorioRS('p1', 'v1')")
  );
  rodar(c, "abrirCandidatoDoRelatorioRS('p1', 'v1')");
  assert.deepEqual(plano(c.__gotos), ['rs_processo']);
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), 'v1');
  assert.equal(rodar(c, '_psFichaAberta'), 'p1');
});

test('sem candidatos: orientação e botão de exportar desligado; filtros mudam a tela; valor de período inválido vira "todo"', () => {
  const c = ctx();
  cenarioTela(c, []);
  const h = rodar(c, 'pageRelatoriosRS()');
  assert.ok(
    h.includes('Ainda não há candidatos') &&
      /Exportar para planilha \(CSV\)/.test(h) &&
      /onclick="exportarRelatorioRS\(\)" disabled/.test(h)
  );
  rodar(c, "filtrarRelatorioRS('dias', '90')");
  assert.equal(rodar(c, '_rsRelatorioFiltro.dias'), 90);
  rodar(c, "filtrarRelatorioRS('dias', '9999')");
  assert.equal(rodar(c, '_rsRelatorioFiltro.dias'), 0);
  rodar(c, "filtrarRelatorioRS('vaga', 'v1')");
  assert.equal(rodar(c, '_rsRelatorioFiltro.vagaId'), 'v1');
  assert.ok(c.__renders >= 3);
});

test('o filtro de período avisa quantos candidatos ficaram de fora por não terem data', () => {
  const c = ctx();
  cenarioTela(c, [cand('a', { historico: [] }), cand('b', { historico: [mov(null, 'nova', 25)] })]);
  rodar(c, '_rsRelatorioFiltro.dias = 30');
  assert.ok(rodar(c, 'pageRelatoriosRS()').includes('1 candidato(s) sem data de entrada ficaram de fora'));
});

test('nomes, origens e motivos com HTML saem como TEXTO em todas as tabelas (sem injeção)', () => {
  const c = ctx();
  const lista = [
    cand('x', {
      nome: '<img src=x onerror=alert(1)>',
      origem: '<script>alert(2)</script>',
      etapa: 'disc_galt',
      historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 5)],
    }),
    cand('y', {
      etapa: 'triagem',
      reprovado: true,
      historico: [mov('triagem', 'reprovado', 3, '<b onmouseover=alert(3)>motivo</b>')],
    }),
  ];
  cenarioTela(c, lista);
  const h = rodar(c, 'pageRelatoriosRS()');
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>') && !h.includes('<b onmouseover'));
  assert.ok(h.includes('&lt;img') && h.includes('&lt;script&gt;'));
});

// ======================= integração =======================
test('a rota está no menu (só Administrador e RH, no grupo Pessoas), no roteador e na regra de acesso', () => {
  const nav = ler('js/05-navigation.js');
  assert.ok(/id: 'rs_relatorios', label: 'R&S — Relatórios', group: 'Pessoas', papeis: \['owner', 'rh'\]/.test(nav));
  assert.ok(/case 'rs_relatorios':\s*return true;/.test(nav));
  assert.ok(/case 'rs_relatorios':\s*return pageRelatoriosRS\(\);/.test(ler('js/07-router-dashboard.js')));
  assert.ok(ler('app.html').includes('js/54-rs-relatorios.js'));
});

test('a tela do Processo seletivo tem o botão "Relatórios" para Administrador e RH, não para o líder', () => {
  for (const [papel, tem] of [
    ['owner', true],
    ['rh', true],
    ['lider', false],
  ]) {
    const c = ctx(papel);
    rodar(
      c,
      `state.cargos = []; state.estrutura = []; state.rs = { requisicoes: [], candidatos: [], configEtapas: {} }; _rsCandidaturasPendentes = {};`
    );
    assert.equal(rodar(c, 'pageProcessoSeletivoRS()').includes("goto('rs_relatorios')"), tem, papel);
  }
});

test('"Reabrir" deixa registro no histórico (e funciona com histórico ausente)', () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = []; state.rs = { requisicoes: [], configEtapas: {}, candidatos: [${J(cand('a', { etapa: 'triagem', reprovado: true }))}, ${J({ ...cand('b', { etapa: 'video', reprovado: true }), historico: undefined })}] };`
  );
  rodar(c, "reabrirCandidatoRS('a'); reabrirCandidatoRS('b');");
  const [a, b] = plano(rodar(c, 'state.rs.candidatos'));
  assert.equal(a.reprovado, false);
  assert.deepEqual(
    [a.historico.at(-1).de, a.historico.at(-1).para, a.historico.at(-1).observacao, a.historico.at(-1).autorId],
    ['reprovado', 'triagem', 'Reaberto', 'p1']
  );
  assert.equal(b.historico.length, 1);
  assert.equal(b.historico[0].para, 'video');
});

test('desempenho: 2000 candidatos com histórico saem em menos de 1,5 s', () => {
  const c = ctx();
  const lista = Array.from({ length: 2000 }, (_, i) =>
    cand(`m${i}`, {
      origem: `Canal ${i % 7}`,
      etapa: 'triagem',
      historico: [
        mov(null, 'nova', i % 20),
        mov('nova', 'triagem', (i % 20) + 2),
        mov('triagem', 'disc_galt', (i % 20) + 6),
        mov('disc_galt', 'triagem', (i % 20) + 7),
        mov('triagem', 'entrevista_final', (i % 20) + 9),
      ],
    })
  );
  const t0 = Date.now();
  const r = montar(c, lista);
  assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
  assert.equal(r.resumo.candidatos, 2000);
});

test('o nome do arquivo exportado usa a data LOCAL (não a do UTC, que à noite já é amanhã)', () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = []; state.rs = { requisicoes: [${J(VAGA)}], candidatos: ${J(CENARIO_FUNIL)}, configEtapas: {} }; _rsRelatorioFiltro = { vagaId: '', dias: 0 };`
  );
  c.Blob = function () {};
  c.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  c.document.createElement = () => ({
    click() {},
    remove() {},
    set href(v) {},
    set download(v) {
      c.__nomeArquivo = v;
    },
  });
  c.document.body = { appendChild() {} };
  rodar(c, 'exportarRelatorioRS()');
  assert.equal(c.__nomeArquivo, `relatorio-recrutamento-${rodar(c, 'hojeLocalISO()')}.csv`);
});

test('quem já foi CONTRATADO nunca é "parado", mesmo que o registro de etapa dele esteja desatualizado', () => {
  const c = ctx();
  const dado = cand('h', {
    etapa: 'disc_galt',
    convertidoEm: iso(20),
    historico: [mov(null, 'nova', 0), mov('nova', 'disc_galt', 2)],
  });
  const t = montar(c, [dado]).tempo;
  assert.deepEqual(t.parados, []);
  assert.equal(
    t.etapas.find((e) => e.id === 'disc_galt'),
    undefined,
    'contratado não está "em andamento" em etapa nenhuma'
  );
});
