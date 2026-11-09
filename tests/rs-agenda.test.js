// =========================================================================
// Agenda das entrevistas (js/56-rs-agenda.js). O relógio é FIXO (quarta-feira, 4 de novembro de 2026, 12:00 em Brasília), então
// cada dia, hora e prazo abaixo pode ser conferido à mão. 12 de novembro de 2026 é uma quinta-feira.
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
const rodar = (c, codigo) => vm.runInContext(codigo, c);

const AGORA = Date.parse('2026-11-04T15:00:00Z'); // 12:00 em Brasília
const HOJE = '2026-11-04';

function fixarRelogio(c, ms) {
  const Real = Date;
  c.Date = class extends Real {
    constructor(...a) {
      if (a.length === 0) super(ms);
      else super(...a);
    }
    static now() {
      return ms;
    }
  };
}
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
    'js/55-rs-lote.js',
    'js/56-rs-agenda.js',
  ]);
  Object.assign(c, {
    TextEncoder,
    meuPapelReal: papel,
    meuPerfilId: 'p1',
    empresaIdAtual: 'e1',
    URL,
    __chamadas: [],
    __toasts: [],
    __auditoria: [],
    __gotos: [],
    __renders: 0,
  });
  c.render = () => c.__renders++;
  c.goto = (id) => c.__gotos.push(id);
  c.showToast = (t) => c.__toasts.push(t);
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.setTimeout = setTimeout;
  c.confirm = () => true;
  c.__responder = () => ({ data: { ok: true }, error: null });
  c.sb = {
    functions: { invoke: async (nome, { body }) => (c.__chamadas.push([nome, body]), c.__responder(nome, body)) },
  };
  fixarRelogio(c, AGORA);
  return c;
}
const VAGA = {
  id: 'v1',
  codigo: 'REQ-1',
  cargoId: 'cg',
  status: 'aprovada',
  publicada: true,
  etapasAtivas: ['triagem', 'entrevista_fit', 'entrevista_final'],
};
const cand = (id, etapa, extra) => ({
  id,
  vagaId: 'v1',
  nome: `Cand ${id}`,
  email: `${id}@x.com`,
  etapa,
  reprovado: false,
  historico: [],
  ...extra,
});
const ent = (id, candidatoId, data, hora, extra) => ({
  id,
  candidatoId,
  etapa: 'entrevista_fit',
  data,
  hora,
  duracaoMin: 60,
  fuso: '-03:00',
  formato: 'online',
  local: 'https://meet.google.com/abc-defg-hij',
  entrevistador: 'Paula',
  observacao: '',
  status: 'agendada',
  emailEnviadoEm: null,
  ...extra,
});
function cenario(c, candidatos, entrevistas = [], vaga = VAGA) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = []; state.rs = { requisicoes: [${J(vaga)}], candidatos: ${J(candidatos)}, entrevistas: ${J(entrevistas)}, configEtapas: {} }; _rsRequisicaoExpandida = 'v1'; _rsAgendaForm = null; _rsAgendaFiltro = { vagaId: '' }; _psFichaAberta = null;`
  );
}
const estadoEnt = (c) => plano(rodar(c, 'state.rs.entrevistas'));
const emails = (c) => c.__chamadas.filter((x) => x[0] === 'enviar-email').map((x) => x[1]);
const CAMPOS = {
  etapa: 'entrevista_fit',
  data: '2026-11-12',
  hora: '14:00',
  duracaoMin: 60,
  fuso: '-03:00',
  formato: 'online',
  local: 'https://meet.google.com/abc-defg-hij',
  entrevistador: 'Paula',
  observacao: '',
};
const salvar = (c, candidatoId, campos, opcoes = {}) =>
  rodar(c, `salvarEntrevistaRS(${J(candidatoId)}, ${J({ ...CAMPOS, ...campos })}, ${J({ agora: AGORA, ...opcoes })})`);

// ======================= data, hora e fuso =======================
test('data e hora: só valem as que existem de verdade', () => {
  const c = ctx();
  const d = (s) => rodar(c, `dataValidaAgendaRS(${J(s)})`);
  const h = (s) => rodar(c, `horaValidaAgendaRS(${J(s)})`);
  assert.deepEqual(['2026-11-12', '2028-02-29', '2026-12-31'].map(d), [true, true, true]);
  assert.deepEqual(['2026-02-30', '2027-02-29', '2026-13-01', '12/11/2026', '', null, '2026-1-5'].map(d), [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  assert.deepEqual(['00:00', '09:05', '23:59'].map(h), [true, true, true]);
  assert.deepEqual(['24:00', '9:00', '12:60', '', null, '12h'].map(h), [false, false, false, false, false, false]);
});

test('início e fim: a hora de parede no fuso escolhido vira o instante certo', () => {
  const c = ctx();
  const ms = (e) => plano(rodar(c, `[inicioEntrevistaMsRS(${J(e)}), fimEntrevistaMsRS(${J(e)})]`));
  assert.deepEqual(ms({ data: '2026-11-12', hora: '14:00', duracaoMin: 60, fuso: '-03:00' }), [
    Date.parse('2026-11-12T17:00:00Z'),
    Date.parse('2026-11-12T18:00:00Z'),
  ]);
  assert.deepEqual(
    ms({ data: '2026-11-12', hora: '14:00', duracaoMin: 90, fuso: '-04:00' }),
    [Date.parse('2026-11-12T18:00:00Z'), Date.parse('2026-11-12T19:30:00Z')],
    'Manaus: uma hora depois no relógio universal'
  );
  assert.equal(
    ms({ data: '2026-11-12', hora: '14:00', duracaoMin: 60, fuso: '-05:00' })[0],
    Date.parse('2026-11-12T19:00:00Z')
  );
  assert.equal(
    ms({ data: '2026-11-12', hora: '14:00', duracaoMin: 60, fuso: '-02:00' })[0],
    Date.parse('2026-11-12T16:00:00Z')
  );
  assert.equal(
    ms({ data: '2026-11-12', hora: '14:00', duracaoMin: 60, fuso: 'lixo' })[0],
    Date.parse('2026-11-12T17:00:00Z'),
    'fuso desconhecido: Brasília'
  );
  assert.equal(
    ms({ data: '2026-11-12', hora: '23:30', duracaoMin: 60, fuso: '-03:00' })[1],
    Date.parse('2026-11-13T03:30:00Z'),
    'atravessa a meia-noite sem erro'
  );
});

test('o texto da data tem o dia da semana certo (calculado da própria data, não do computador)', () => {
  const c = ctx();
  const q = (e) => rodar(c, `rotuloQuandoRS(${J(e)})`);
  assert.equal(
    q({ data: '2026-11-12', hora: '14:00', fuso: '-03:00' }),
    'quinta-feira, 12 de novembro de 2026, às 14:00 (horário de Brasília)'
  );
  assert.equal(
    q({ data: '2026-12-25', hora: '09:30', fuso: '-04:00' }),
    'sexta-feira, 25 de dezembro de 2026, às 09:30 (horário de Manaus)'
  );
  assert.equal(
    q({ data: '2027-01-01', hora: '08:00', fuso: '-05:00' }),
    'sexta-feira, 1 de janeiro de 2027, às 08:00 (horário do Acre)'
  );
  assert.equal(rodar(c, `rotuloCurtoQuandoRS({ data: '2026-11-04', hora: '09:05' })`), '04/11/2026 às 09:05');
});

// ======================= validação =======================
test('validar: uma entrevista correta sai limpa, com os padrões e os limites de tamanho', () => {
  const c = ctx();
  const v = (campos, opcoes = {}) =>
    plano(
      rodar(
        c,
        `validarEntrevistaRS(${J(campos)}, ${J({ agora: AGORA, etapasPermitidas: ['entrevista_fit', 'entrevista_final'], ...opcoes })})`
      )
    );
  const ok = v({ ...CAMPOS, entrevistador: '  Paula  ', local: '  https://meet.google.com/x  ' });
  assert.equal(ok.ok, true);
  assert.deepEqual(
    [ok.entrevista.entrevistador, ok.entrevista.local, ok.entrevista.duracaoMin, ok.entrevista.fuso],
    ['Paula', 'https://meet.google.com/x', 60, '-03:00']
  );
  const padroes = v({ ...CAMPOS, duracaoMin: 77, fuso: 'lixo' });
  assert.deepEqual(
    [padroes.entrevista.duracaoMin, padroes.entrevista.fuso],
    [45, '-03:00'],
    'duração e fuso inválidos viram os padrões'
  );
  const longos = v({
    ...CAMPOS,
    entrevistador: 'x'.repeat(200),
    observacao: 'y'.repeat(500),
    formato: 'telefone',
    local: 'z'.repeat(500),
  });
  assert.deepEqual(
    [longos.entrevista.entrevistador.length, longos.entrevista.observacao.length, longos.entrevista.local.length],
    [80, 300, 300]
  );
});

test('validar: cada campo errado devolve uma mensagem clara', () => {
  const c = ctx();
  const erro = (campos, opcoes = {}) =>
    rodar(
      c,
      `validarEntrevistaRS(${J({ ...CAMPOS, ...campos })}, ${J({ agora: AGORA, etapasPermitidas: ['entrevista_fit'], ...opcoes })})`
    ).erro;
  assert.equal(erro({ etapa: 'triagem' }), 'Escolha a etapa da entrevista.');
  assert.equal(erro({ etapa: 'entrevista_final' }), 'Escolha a etapa da entrevista.', 'a vaga não usa essa etapa');
  assert.equal(erro({ data: '2026-02-30' }), 'Informe uma data válida.');
  assert.equal(erro({ hora: '25:00' }), 'Informe uma hora válida (por exemplo, 14:30).');
  assert.equal(erro({ formato: 'carta' }), 'Escolha o formato da entrevista.');
  assert.equal(erro({ formato: 'online', local: 'meet sem link' }), 'Informe o link da reunião (começa com https://).');
  assert.equal(
    erro({ formato: 'online', local: 'javascript:alert(1)' }),
    'Informe o link da reunião (começa com https://).'
  );
  assert.equal(erro({ formato: 'online', local: '' }), 'Informe o link da reunião (começa com https://).');
  assert.equal(erro({ formato: 'presencial', local: 'ab' }), 'Informe o endereço ou a sala da entrevista.');
  assert.equal(erro({ data: '2026-11-04', hora: '11:59' }), 'A data e a hora precisam estar no futuro.');
  assert.equal(erro({ formato: 'telefone', local: '' }), undefined, 'telefone sem local é permitido');
  assert.equal(
    erro({ data: '2026-11-04', hora: '11:59' }, { permitirPassado: true }),
    undefined,
    'registrar uma entrevista que já aconteceu'
  );
});

// ======================= conflitos =======================
test('conflitos: mesmo candidato ou mesmo entrevistador no mesmo horário; encostar não conflita; só conta o que está agendado', () => {
  const c = ctx();
  const outras = [
    ent('a', 'c1', '2026-11-12', '14:00', { duracaoMin: 60, entrevistador: 'Paula' }),
    ent('b', 'c2', '2026-11-12', '14:30', { duracaoMin: 60, entrevistador: 'Márcio' }),
    ent('x', 'c3', '2026-11-12', '14:00', { status: 'cancelada', entrevistador: 'João' }),
    ent('y', 'c4', '2026-11-12', '14:00', { status: 'realizada', entrevistador: 'João' }),
  ];
  const conf = (nova, candidatoId, ignorar) =>
    plano(
      rodar(
        c,
        `conflitosEntrevistaRS(${J({ ...ent('n', candidatoId, '2026-11-12', '14:00'), ...nova })}, ${J(candidatoId)}, ${J(outras)}, ${J(ignorar || null)})`
      )
    );
  assert.deepEqual(
    conf({ entrevistador: 'Ana' }, 'c1').map((k) => k.tipo),
    ['candidato'],
    'c1 já tem a das 14:00 (a de c2 é de outra pessoa e de outro entrevistador)'
  );
  assert.deepEqual(
    conf({ hora: '15:00', entrevistador: 'Ana' }, 'c9'),
    [],
    'a das 14:00 termina às 15:00: encostar não conflita'
  );
  const mesmoEntrevistador = conf({ hora: '14:15', entrevistador: '  márcio ' }, 'c9');
  assert.deepEqual(
    mesmoEntrevistador.map((k) => [k.tipo, k.candidatoId]),
    [['entrevistador', 'c2']],
    'ignora maiúscula, acento e espaços'
  );
  assert.deepEqual(conf({ entrevistador: 'João' }, 'c9'), [], 'cancelada e realizada não ocupam horário');
  assert.deepEqual(conf({ entrevistador: '' }, 'c9'), [], 'sem entrevistador informado não se compara');
  assert.deepEqual(conf({ entrevistador: 'Ana' }, 'c1', 'a'), [], 'ao remarcar, ela mesma não conta');
});

// ======================= arquivo .ics e links =======================
const EV = {
  ...ent('abc123', 'c1', '2026-11-12', '14:00', {
    duracaoMin: 60,
    local: 'Rua das Flores, 100; sala 2',
    formato: 'presencial',
    observacao: 'Trazer RG, CPF; 2ª via\nAndar 3',
  }),
};
test('.ics: estrutura, horário em UTC, quebras CRLF e escape de vírgula, ponto e vírgula e quebra de linha', () => {
  const c = ctx();
  const ics = rodar(c, `gerarIcsRS([{ entrevista: ${J(EV)}, titulo: 'Entrevista: Ana, Silva' }], ${AGORA})`);
  const linhas = ics.split('\r\n');
  assert.equal(linhas.at(-1), '', 'termina com CRLF');
  assert.deepEqual(linhas.slice(0, 5), [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//INETRIS//NORTE//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]);
  for (const esperado of [
    'BEGIN:VEVENT',
    'UID:abc123@inetris.com.br',
    'DTSTAMP:20261104T150000Z',
    'DTSTART:20261112T170000Z',
    'DTEND:20261112T180000Z',
    'SUMMARY:Entrevista: Ana\\, Silva',
    'LOCATION:Rua das Flores\\, 100\\; sala 2',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ])
    assert.ok(linhas.includes(esperado), esperado);
  assert.ok(ics.replace(/\r\n /g, '').includes('Trazer RG\\, CPF\\; 2ª via\\nAndar 3'), 'a observação saiu escapada');
  assert.ok(!/[^\r]\n/.test(ics), 'nenhuma quebra de linha solta (só CRLF)');
});

test('.ics: nenhuma linha passa de 75 bytes, a dobra não parte letra acentuada e, desdobrada, volta ao texto original', () => {
  const c = ctx();
  const longo = 'ç'.repeat(120) + ' observação com acentuação ' + '😀'.repeat(20);
  const ics = rodar(c, `gerarIcsRS([{ entrevista: ${J({ ...EV, observacao: longo })}, titulo: 'T' }], ${AGORA})`);
  for (const l of ics.split('\r\n'))
    assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `linha com ${Buffer.byteLength(l, 'utf8')} bytes`);
  const desdobrado = ics.replace(/\r\n /g, '');
  assert.ok(desdobrado.includes(longo), 'o texto original está inteiro depois de desdobrar');
  assert.ok(!desdobrado.includes('\uFFFD'), 'nenhum caractere partido');
});

test('.ics: entrevista cancelada vira STATUS:CANCELLED; sem local não há LOCATION; vários eventos na mesma agenda', () => {
  const c = ctx();
  const cancelada = rodar(
    c,
    `gerarIcsRS([{ entrevista: ${J({ ...EV, status: 'cancelada', local: '' })}, titulo: 'T' }], ${AGORA})`
  );
  assert.ok(cancelada.includes('STATUS:CANCELLED') && !cancelada.includes('LOCATION:'));
  const dois = rodar(
    c,
    `gerarIcsRS([{ entrevista: ${J(EV)}, titulo: 'A' }, { entrevista: ${J({ ...EV, id: 'zzz' })}, titulo: 'B' }], ${AGORA})`
  );
  assert.equal((dois.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((dois.match(/BEGIN:VCALENDAR/g) || []).length, 1);
});

test('links de calendário: datas em UTC e texto codificado', () => {
  const c = ctx();
  const dados = {
    titulo: 'Entrevista — Vendedor & Cia',
    inicioMs: Date.parse('2026-11-12T17:00:00Z'),
    fimMs: Date.parse('2026-11-12T18:00:00Z'),
    detalhes: 'Formato: Online\nLink: https://x.com/a?b=1&c=2',
    local: 'Rua A, 1',
  };
  const g = rodar(c, `linkGoogleAgendaRS(${J(dados)})`);
  assert.ok(
    g.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=') &&
      g.includes('&dates=20261112T170000Z/20261112T180000Z&') &&
      g.includes('Vendedor%20%26%20Cia') &&
      g.includes('location=Rua%20A%2C%201')
  );
  const o = rodar(c, `linkOutlookAgendaRS(${J(dados)})`);
  assert.ok(
    o.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?') &&
      o.includes('startdt=2026-11-12T17%3A00%3A00Z') &&
      o.includes('enddt=2026-11-12T18%3A00%3A00Z') &&
      o.includes('rru=addevent')
  );
});

// ======================= e-mail do candidato =======================
const mail = (c, args) =>
  plano(
    rodar(
      c,
      `montarEmailEntrevistaRS(${J({ nome: 'Ana', nomeVaga: 'Vendedor', entrevista: { ...ent('i', 'c1', '2026-11-12', '14:00') }, ...args })})`
    )
  );

test('e-mail "agendada": assunto, data por extenso, duração, formato com o link e os dois botões de calendário', () => {
  const c = ctx();
  const m = mail(c, { tipo: 'agendada' });
  assert.equal(m.assunto, 'Entrevista agendada: Vendedor');
  for (const t of [
    'Olá, Ana!',
    'quinta-feira, 12 de novembro de 2026, às 14:00 (horário de Brasília)',
    'cerca de 60 minutos',
    'Online (vídeo)',
    'href="https://meet.google.com/abc-defg-hij">Entrar na reunião',
    'Com</b>',
    'Paula',
    'Google Agenda',
    'Outlook',
    'calendar.google.com',
    'outlook.live.com',
    'avise a equipe da empresa com antecedência',
  ])
    assert.ok(m.corpoHtml.includes(t), t);
});

test('e-mail: presencial mostra o local; telefone sem número avisa que ligam para o cadastro; sem entrevistador não há linha "Com"', () => {
  const c = ctx();
  const presencial = mail(c, {
    tipo: 'agendada',
    entrevista: ent('i', 'c1', '2026-11-12', '14:00', {
      formato: 'presencial',
      local: 'Rua das Flores, 100',
      entrevistador: '',
    }),
  });
  assert.ok(
    presencial.corpoHtml.includes('Presencial — Rua das Flores, 100') && !presencial.corpoHtml.includes('Com</b>')
  );
  const tel = mail(c, {
    tipo: 'agendada',
    entrevista: ent('i', 'c1', '2026-11-12', '14:00', { formato: 'telefone', local: '' }),
  });
  assert.ok(tel.corpoHtml.includes('a equipe vai ligar para o telefone do seu cadastro'));
  const tel2 = mail(c, {
    tipo: 'agendada',
    entrevista: ent('i', 'c1', '2026-11-12', '14:00', { formato: 'telefone', local: '(11) 99999-0000' }),
  });
  assert.ok(tel2.corpoHtml.includes('Telefone — (11) 99999-0000'));
});

test('e-mail "remarcada", "lembrete" e "cancelada": cada um diz o que mudou; o de cancelamento não leva botões nem dados da reunião', () => {
  const c = ctx();
  const antes = ent('i', 'c1', '2026-11-11', '10:00');
  const r = mail(c, { tipo: 'remarcada', anterior: antes });
  assert.equal(r.assunto, 'Horário da entrevista alterado: Vendedor');
  assert.ok(
    r.corpoHtml.includes('Antes: <s>quarta-feira, 11 de novembro de 2026, às 10:00') &&
      r.corpoHtml.includes('quinta-feira, 12 de novembro')
  );
  const l = mail(c, { tipo: 'lembrete' });
  assert.equal(l.assunto, 'Lembrete da sua entrevista: Vendedor');
  assert.ok(l.corpoHtml.includes('Lembrando da sua entrevista'));
  const x = mail(c, { tipo: 'cancelada' });
  assert.equal(x.assunto, 'Entrevista cancelada: Vendedor');
  assert.ok(
    x.corpoHtml.includes('foi cancelada') &&
      x.corpoHtml.includes('quinta-feira, 12 de novembro') &&
      !x.corpoHtml.includes('Google Agenda') &&
      !x.corpoHtml.includes('<table')
  );
  assert.equal(mail(c, { tipo: 'inventado' }), null);
});

test('e-mail: nada que o RH digitou vira HTML (nome, vaga, local, entrevistador, observação), e link que não é http(s) não vira botão', () => {
  const c = ctx();
  const ruim = '<img src=x onerror=alert(1)>';
  const m = mail(c, {
    tipo: 'agendada',
    nome: ruim,
    nomeVaga: ruim,
    entrevista: ent('i', 'c1', '2026-11-12', '14:00', {
      formato: 'presencial',
      local: ruim,
      entrevistador: ruim,
      observacao: `${ruim}\n<script>1</script>`,
    }),
  });
  assert.ok(!m.corpoHtml.includes('<img src=x') && !m.corpoHtml.includes('<script>1'));
  assert.ok(m.corpoHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
  const js = mail(c, {
    tipo: 'agendada',
    entrevista: ent('i', 'c1', '2026-11-12', '14:00', { formato: 'online', local: 'javascript:alert(1)' }),
  });
  assert.ok(!js.corpoHtml.includes('href="javascript:'), 'não vira link');
});

// ======================= a agenda calculada =======================
test('agenda: hoje, próximos 30 dias agrupados por dia e em ordem, o que já passou sem resultado e quem está sem data', () => {
  const c = ctx();
  const candidatos = [
    cand('c1', 'entrevista_fit'),
    cand('c2', 'entrevista_final'),
    cand('c3', 'entrevista_fit'),
    cand('c4', 'entrevista_fit'),
    cand('c5', 'entrevista_fit'),
    cand('c6', 'triagem'),
    cand('c7', 'entrevista_fit', { reprovado: true }),
    cand('c8', 'entrevista_fit', { vagaId: 'enc' }),
    cand('c9', 'entrevista_fit', { convertidoEm: '2026-10-01' }),
    cand('c10', 'entrevista_fit'),
  ];
  const entrevistas = [
    ent('hoje', 'c1', HOJE, '15:00'), // 18:00Z: depois de agora
    ent('passou', 'c3', HOJE, '09:00'), // terminou 10:00 BRT, antes de agora
    ent('amanha2', 'c1', '2026-11-05', '10:00', { etapa: 'entrevista_final' }),
    ent('amanha1', 'c2', '2026-11-05', '08:00', { etapa: 'entrevista_final' }),
    ent('limite', 'c2', '2026-12-04', '10:00', { etapa: 'entrevista_final' }), // dentro dos 30 dias
    ent('longe', 'c2', '2026-12-04', '14:00', { etapa: 'entrevista_final' }), // depois dos 30 dias
    ent('feita', 'c4', '2026-11-03', '10:00', { status: 'realizada' }),
    ent('faltou', 'c5', '2026-11-03', '10:00', { status: 'faltou' }),
    ent('reprovado', 'c7', '2026-11-10', '10:00'),
    ent('orfa', 'zz', '2026-11-10', '10:00'),
  ];
  const a = plano(
    rodar(
      c,
      `montarAgendaRS(${J({ entrevistas, candidatos, requisicoes: [VAGA, { id: 'enc', status: 'aprovada', encerrada: true }], agora: AGORA, hojeISO: HOJE })})`
    )
  );
  assert.deepEqual(
    a.hoje.map((e) => e.id),
    ['hoje']
  );
  assert.deepEqual(
    a.paraAtualizar.map((e) => e.id),
    ['passou']
  );
  assert.deepEqual(
    a.porDia.map((d) => [d.data, d.itens.map((e) => e.id)]),
    [
      [HOJE, ['hoje']],
      ['2026-11-05', ['amanha1', 'amanha2']],
      ['2026-12-04', ['limite']],
    ]
  );
  assert.equal(a.total, 4);
  // sem data: c1 (tem agendada de entrevista_fit? 'hoje' é entrevista_fit: tem), c2 tem, c3 tem (a que passou ainda é agendada), c4 fez (realizada),
  // c5 faltou -> precisa de nova data; c10 nunca teve -> precisa; c6 não está em etapa de entrevista; c7 reprovado; c8 vaga encerrada; c9 contratado
  assert.deepEqual(
    a.semData.map((x) => x.id),
    ['c5', 'c10']
  );
  assert.equal(a.hoje[0].candidato.nome, 'Cand c1');
});

test('agenda: entrevista cancelada deixa o candidato precisando de nova data; o filtro de vaga restringe tudo', () => {
  const c = ctx();
  const candidatos = [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit', { vagaId: 'v2' })];
  const entrevistas = [
    ent('x', 'c1', '2026-11-10', '10:00', { status: 'cancelada' }),
    ent('y', 'c2', '2026-11-10', '10:00'),
  ];
  const todas = plano(
    rodar(
      c,
      `montarAgendaRS(${J({ entrevistas, candidatos, requisicoes: [VAGA, { ...VAGA, id: 'v2' }], agora: AGORA, hojeISO: HOJE })})`
    )
  );
  assert.deepEqual(
    [todas.semData.map((x) => x.id), todas.porDia.flatMap((d) => d.itens.map((e) => e.id))],
    [['c1'], ['y']]
  );
  const v2 = plano(
    rodar(
      c,
      `montarAgendaRS(${J({ entrevistas, candidatos, requisicoes: [VAGA, { ...VAGA, id: 'v2' }], agora: AGORA, hojeISO: HOJE, vagaId: 'v2' })})`
    )
  );
  assert.deepEqual([v2.semData, v2.porDia.flatMap((d) => d.itens.map((e) => e.id))], [[], ['y']]);
});

test('painel "para você fazer agora": três avisos de agenda, só com o que há', () => {
  const c = ctx();
  const candidatos = [cand('c1', 'entrevista_fit'), cand('c3', 'entrevista_fit'), cand('c5', 'entrevista_fit')];
  const entrevistas = [ent('hoje', 'c1', HOJE, '15:00'), ent('passou', 'c3', HOJE, '09:00')];
  const acoes = plano(
    rodar(c, `acoesAgendaRS(${J({ entrevistas, candidatos, requisicoes: [VAGA], agora: AGORA, hojeISO: HOJE })})`)
  );
  assert.deepEqual(
    acoes.map((a) => [a.chave, a.total]),
    [
      ['entrevistas_hoje', 1],
      ['entrevistas_atualizar', 1],
      ['sem_entrevista', 1],
    ]
  );
  assert.equal(acoes[0].texto, '1 entrevista(s) hoje');
  assert.equal(acoes[2].vagaId, 'v1');
  assert.deepEqual(
    plano(
      rodar(
        c,
        `acoesAgendaRS(${J({ entrevistas: [], candidatos: [], requisicoes: [VAGA], agora: AGORA, hojeISO: HOJE })})`
      )
    ),
    []
  );
});

test('as pendências do Processo seletivo e do painel incluem a agenda só para Administrador e RH, e levam à página da agenda', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')], [ent('hoje', 'c1', HOJE, '15:00')]);
  const args = (gestor) => ({
    requisicoes: [VAGA],
    candidatos: plano(rodar(c, 'state.rs.candidatos')),
    entrevistas: estadoEnt(c),
    agora: AGORA,
    gestor,
    candidaturasPendentes: {},
    vagaSelecionadaId: null,
    videos: [],
    entregas: [],
  });
  const chaves = (gestor) => plano(rodar(c, `acoesPendentesRS(${J(args(gestor))})`)).map((a) => a.chave);
  assert.ok(chaves(true).includes('entrevistas_hoje'));
  assert.ok(!chaves(false).includes('entrevistas_hoje'));
  assert.ok(
    !plano(rodar(c, `acoesPendentesRS(${J({ ...args(true), entrevistas: undefined })})`)).some((a) =>
      a.chave.startsWith('entrevistas')
    ),
    'sem a lista de entrevistas, nada muda (compatível)'
  );
  rodar(c, "resolverPendenciaRS('entrevistas_hoje', null); irParaPendenciaRS('entrevistas_atualizar', null);");
  assert.deepEqual(plano(c.__gotos), ['rs_agenda', 'rs_agenda']);
  assert.ok(
    rodar(c, 'renderPendenciasRecrutamento()').includes('1 entrevista(s) hoje'),
    'o cartão do painel inicial mostra'
  );
});

// ======================= agendar, remarcar, cancelar =======================
test('agendar: cria a entrevista como item próprio, manda o e-mail e guarda que o candidato foi avisado; Auditoria sem nomes', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  const r = plano(await salvar(c, 'c1', {}, { enviarEmail: true }));
  assert.equal(r.ok, true);
  assert.equal(r.email, true);
  const [e] = estadoEnt(c);
  assert.deepEqual(
    [e.candidatoId, e.etapa, e.data, e.hora, e.status, e.criadoPor],
    ['c1', 'entrevista_fit', '2026-11-12', '14:00', 'agendada', 'p1']
  );
  assert.ok(e.id && e.criadoEm && e.emailEnviadoEm);
  assert.equal(emails(c).length, 1);
  assert.equal(emails(c)[0].destinatario, 'c1@x.com');
  assert.equal(emails(c)[0].assunto, 'Entrevista agendada: Vendedor');
  assert.deepEqual(plano(c.__auditoria), [
    ['rs.entrevista_agendada', { vagaId: 'v1', etapa: 'entrevista_fit', emailEnviado: true }],
  ]);
  assert.ok(!J(c.__auditoria).includes('Cand c1') && !J(c.__auditoria).includes('@x.com'));
});

test('agendar sem marcar o e-mail: não envia nada e não diz que avisou', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  const r = plano(await salvar(c, 'c1', {}, { enviarEmail: false }));
  assert.equal(r.email, null);
  assert.equal(emails(c).length, 0);
  assert.equal(estadoEnt(c)[0].emailEnviadoEm, null);
});

test('o e-mail que não sai NÃO desfaz o agendamento: a entrevista fica e o resultado avisa', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  c.__responder = () => ({ data: null, error: { message: 'caixa cheia' } });
  const r = plano(await salvar(c, 'c1', {}, { enviarEmail: true }));
  assert.deepEqual([r.ok, r.email], [true, false]);
  assert.equal(estadoEnt(c).length, 1);
  assert.equal(estadoEnt(c)[0].emailEnviadoEm, null);
});

test('candidato sem e-mail: agenda normalmente; nada é enviado (resultado nulo)', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit', { email: '' })]);
  const r = plano(await salvar(c, 'c1', {}, { enviarEmail: true }));
  assert.deepEqual([r.ok, r.email], [true, null]);
  assert.equal(emails(c).length, 0);
});

test('dados inválidos não criam nada e devolvem a mensagem', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  const r = plano(await salvar(c, 'c1', { data: '2026-02-30' }));
  assert.deepEqual([r.ok, r.erro], [false, 'Informe uma data válida.']);
  assert.deepEqual(estadoEnt(c), []);
  assert.equal(emails(c).length, 0);
});

test('conflito de horário: pede confirmação; confirmando, agenda mesmo assim', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit')],
    [ent('outra', 'c2', '2026-11-12', '14:30', { entrevistador: 'Paula' })]
  );
  const r = plano(await salvar(c, 'c1', { entrevistador: 'paula' }));
  assert.deepEqual([r.ok, r.precisaConfirmar, r.conflitos.map((k) => k.tipo)], [false, true, ['entrevistador']]);
  assert.equal(estadoEnt(c).length, 1, 'ainda não criou');
  const ok = plano(await salvar(c, 'c1', { entrevistador: 'paula' }, { confirmouConflito: true }));
  assert.equal(ok.ok, true);
  assert.equal(estadoEnt(c).length, 2);
});

test('remarcar: altera a MESMA entrevista (sem criar outra), volta para "agendada" e manda o e-mail de remarcação com o horário antigo', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [ent('e1', 'c1', '2026-11-11', '10:00', { emailEnviadoEm: '2026-11-04T10:00:00Z' })]
  );
  const r = plano(
    await salvar(c, 'c1', { data: '2026-11-13', hora: '16:00' }, { entrevistaId: 'e1', enviarEmail: true })
  );
  assert.equal(r.ok, true);
  const lista = estadoEnt(c);
  assert.deepEqual(
    [lista.length, lista[0].id, lista[0].data, lista[0].hora, lista[0].status],
    [1, 'e1', '2026-11-13', '16:00', 'agendada']
  );
  assert.equal(emails(c)[0].assunto, 'Horário da entrevista alterado: Vendedor');
  assert.ok(emails(c)[0].corpoHtml.includes('Antes: <s>quarta-feira, 11 de novembro de 2026, às 10:00'));
  assert.equal(c.__auditoria[0][0], 'rs.entrevista_remarcada');
  assert.deepEqual(plano(await salvar(c, 'c1', {}, { entrevistaId: 'nao-existe' })), {
    ok: false,
    erro: 'Essa entrevista não existe mais.',
  });
});

test('só Administrador e RH agendam; candidato reprovado ou inexistente é recusado', async () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, [cand('c1', 'entrevista_fit')]);
    assert.equal(plano(await salvar(c, 'c1', {})).ok, false, String(papel));
    assert.deepEqual(estadoEnt(c), []);
  }
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit', { reprovado: true })]);
  assert.equal(plano(await salvar(c, 'c1', {})).ok, false);
  assert.equal(plano(await salvar(c, 'zz', {})).ok, false);
});

test('realizada e faltou: só a partir de "agendada"; Auditoria só com o resultado', () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [ent('a', 'c1', '2026-11-12', '14:00'), ent('b', 'c1', '2026-11-13', '14:00', { status: 'cancelada' })]
  );
  rodar(
    c,
    "mudarResultadoEntrevistaRS('a', 'realizada'); mudarResultadoEntrevistaRS('b', 'realizada'); mudarResultadoEntrevistaRS('a', 'faltou'); mudarResultadoEntrevistaRS('a', 'cancelada');"
  );
  assert.deepEqual(
    estadoEnt(c).map((e) => e.status),
    ['realizada', 'cancelada'],
    'a cancelada não vira realizada; a realizada não muda de novo'
  );
  assert.deepEqual(plano(c.__auditoria), [['rs.entrevista_resultado', { vagaId: 'v1', status: 'realizada' }]]);
  const lider = ctx('lider');
  cenario(lider, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  rodar(lider, "mudarResultadoEntrevistaRS('a', 'realizada')");
  assert.equal(estadoEnt(lider)[0].status, 'agendada');
});

test('cancelar: se o candidato já tinha sido avisado, recebe o aviso de cancelamento; se não, nada é enviado; "não" na confirmação não faz nada', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [
      ent('avisada', 'c1', '2026-11-12', '14:00', { emailEnviadoEm: '2026-11-04T10:00:00Z' }),
      ent('naoavisada', 'c1', '2026-11-13', '14:00'),
    ]
  );
  await rodar(c, "cancelarEntrevistaRS('avisada')");
  await rodar(c, "cancelarEntrevistaRS('naoavisada')");
  assert.deepEqual(
    estadoEnt(c).map((e) => e.status),
    ['cancelada', 'cancelada']
  );
  assert.deepEqual(
    emails(c).map((m) => m.assunto),
    ['Entrevista cancelada: Vendedor']
  );
  const nao = ctx();
  cenario(nao, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  nao.confirm = () => false;
  await rodar(nao, "cancelarEntrevistaRS('a')");
  assert.equal(estadoEnt(nao)[0].status, 'agendada');
});

test('lembrete e reenvio: manda o e-mail certo, marca quando saiu e avisa quando não sai ou não há e-mail', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit', { email: '' })],
    [ent('a', 'c1', '2026-11-05', '14:00'), ent('b', 'c2', '2026-11-05', '15:00')]
  );
  await rodar(c, "reenviarEmailEntrevistaRS('a', 'lembrete')");
  assert.equal(emails(c)[0].assunto, 'Lembrete da sua entrevista: Vendedor');
  assert.ok(estadoEnt(c)[0].emailEnviadoEm);
  await rodar(c, "reenviarEmailEntrevistaRS('b', 'lembrete')");
  assert.equal(c.__toasts.at(-1), 'Este candidato não tem e-mail cadastrado.');
  c.__responder = () => ({ data: null, error: { message: 'x' } });
  await rodar(c, "reenviarEmailEntrevistaRS('a', 'agendada')");
  assert.equal(c.__toasts.at(-1), 'O e-mail não saiu. Tente de novo mais tarde.');
});

test('reprovar (individual ou em lote) cancela as entrevistas que ainda estavam agendadas, e só elas', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit')],
    [
      ent('a', 'c1', '2026-11-12', '14:00'),
      ent('feita', 'c1', '2026-11-03', '10:00', { status: 'realizada' }),
      ent('b', 'c2', '2026-11-12', '15:00'),
    ]
  );
  c.prompt = () => 'Sem perfil';
  rodar(c, "reprovarCandidatoRS('c1')");
  assert.deepEqual(
    estadoEnt(c).map((e) => [e.id, e.status]),
    [
      ['a', 'cancelada'],
      ['feita', 'realizada'],
      ['b', 'agendada'],
    ]
  );
  rodar(c, 'LOTE_RS_PAUSA_MS = 0; _rsSelecaoAtiva = true; _rsSelecionados = ["c2"]; abrirLoteRS("reprovar");');
  await rodar(c, 'executarLoteRS()');
  assert.equal(estadoEnt(c).find((e) => e.id === 'b').status, 'cancelada');
});

// ======================= o formulário da tela =======================
function domFalso(valores, emailMarcado = true) {
  return {
    getElementById: (id) =>
      id === 'rs_ent_email' ? { checked: emailMarcado } : id in valores ? { value: valores[id] } : null,
  };
}
const VALORES_DOM = {
  rs_ent_etapa: 'entrevista_fit',
  rs_ent_data: '2026-11-12',
  rs_ent_hora: '14:00',
  rs_ent_duracao: '60',
  rs_ent_fuso: '-03:00',
  rs_ent_formato: 'online',
  rs_ent_local: 'https://meet.google.com/abc-defg-hij',
  rs_ent_entrevistador: 'Paula',
  rs_ent_obs: '',
};

test('formulário: lê os campos da tela, agenda, fecha o formulário e avisa o que aconteceu', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  assert.equal(rodar(c, '_psFichaAberta'), 'c1');
  c.document = domFalso(VALORES_DOM);
  await rodar(c, 'salvarFormularioEntrevistaRS(false)');
  assert.equal(rodar(c, '_rsAgendaForm'), null);
  assert.equal(estadoEnt(c).length, 1);
  assert.equal(c.__toasts.at(-1), 'Entrevista agendada e e-mail enviado.');
});

test('formulário: um erro mostra a mensagem e mantém o formulário aberto com o que foi digitado', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  c.document = domFalso({ ...VALORES_DOM, rs_ent_data: '' });
  await rodar(c, 'salvarFormularioEntrevistaRS(false)');
  assert.equal(rodar(c, '_rsAgendaForm.erro'), 'Informe uma data válida.');
  assert.equal(rodar(c, '_rsAgendaForm.valores.entrevistador'), 'Paula');
  assert.deepEqual(estadoEnt(c), []);
});

test('formulário: conflito mostra o aviso e o botão passa a "Agendar mesmo assim"', async () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit', { nome: 'Rita' })],
    [ent('o', 'c2', '2026-11-12', '14:30', { entrevistador: 'Paula' })]
  );
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  c.document = domFalso(VALORES_DOM);
  await rodar(c, 'salvarFormularioEntrevistaRS(false)');
  const h = rodar(c, 'entrevistasPainelRS(state.rs.candidatos[0], state.rs.requisicoes[0])');
  assert.ok(
    h.includes('Atenção, há conflito de horário') &&
      h.includes('Rita tem entrevista com o mesmo entrevistador') &&
      h.includes('Agendar mesmo assim') &&
      h.includes('salvarFormularioEntrevistaRS(true)')
  );
  await rodar(c, 'salvarFormularioEntrevistaRS(true)');
  assert.equal(estadoEnt(c).length, 2);
});

test('formulário: se o e-mail não saiu, o aviso diz para usar "Reenviar e-mail"', async () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  c.__responder = () => ({ data: null, error: { message: 'x' } });
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  c.document = domFalso(VALORES_DOM);
  await rodar(c, 'salvarFormularioEntrevistaRS(false)');
  assert.match(c.__toasts.at(-1), /Reenviar e-mail/);
});

// ======================= a ficha =======================
const PAINEL = 'entrevistasPainelRS(state.rs.candidatos[0], state.rs.requisicoes[0])';
test('painel na ficha: só aparece na etapa de entrevista ou quando já há entrevistas; reprovado não pode agendar', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  assert.equal(rodar(c, PAINEL), '');
  cenario(c, [cand('c1', 'entrevista_fit')]);
  const h = rodar(c, PAINEL);
  assert.ok(
    h.includes('Entrevistas (0)') && h.includes('Nenhuma entrevista marcada ainda.') && h.includes('Agendar entrevista')
  );
  cenario(c, [cand('c1', 'triagem')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  assert.ok(rodar(c, PAINEL).includes('Entrevistas (1)'), 'já tem entrevista: aparece mesmo fora da etapa');
  cenario(
    c,
    [cand('c1', 'entrevista_fit', { reprovado: true })],
    [ent('a', 'c1', '2026-11-12', '14:00', { status: 'cancelada' })]
  );
  assert.ok(!rodar(c, PAINEL).includes('Agendar entrevista'));
});

test('painel na ficha: lista com data, formato, entrevistador, situação e as ações certas; o líder só vê', () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [
      ent('a', 'c1', '2026-11-12', '14:00', { emailEnviadoEm: '2026-11-04T10:00:00Z' }),
      ent('b', 'c1', '2026-11-03', '10:00', { status: 'realizada' }),
    ]
  );
  const h = rodar(c, PAINEL);
  for (const t of [
    'quinta-feira, 12 de novembro de 2026, às 14:00',
    'Online (vídeo)',
    'com Paula',
    'candidato avisado por e-mail',
    'Agendada',
    'Realizada',
    'Remarcar',
    'Faltou',
    'Reenviar e-mail',
    'Baixar .ics',
    'Cancelar',
  ])
    assert.ok(h.includes(t), t);
  assert.equal((h.match(/Remarcar/g) || []).length, 1, 'só a agendada tem ações');
  const lider = ctx('lider');
  cenario(lider, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  const hl = rodar(lider, PAINEL);
  assert.ok(
    hl.includes('quinta-feira, 12 de novembro') &&
      !hl.includes('Remarcar') &&
      !hl.includes('Agendar entrevista') &&
      !hl.includes('Cancelar')
  );
});

test('formulário na ficha: campos com rótulo, só as etapas de entrevista da vaga, e-mail desligado sem endereço, tudo escapado', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit', { email: '' })]);
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  rodar(c, '_rsAgendaForm.valores.local = \'"><script>1</script>\'; _rsAgendaForm.valores.entrevistador = "<b>x</b>";');
  const h = rodar(c, PAINEL);
  for (const id of [
    'rs_ent_etapa',
    'rs_ent_data',
    'rs_ent_hora',
    'rs_ent_duracao',
    'rs_ent_fuso',
    'rs_ent_formato',
    'rs_ent_local',
    'rs_ent_entrevistador',
    'rs_ent_obs',
  ])
    assert.ok(h.includes(`<label for="${id}"`), `rótulo de ${id}`);
  assert.ok(h.includes('Entrevista de fit cultural') && h.includes('Entrevista final') && !h.includes('>Triagem<'));
  assert.ok(/id="rs_ent_email"[^>]*disabled/.test(h) && h.includes('Candidato sem e-mail cadastrado'));
  assert.ok(!h.includes('<script>1') && !h.includes('<b>x</b>'));
  assert.ok(h.includes('Brasília (UTC-3)') && h.includes('Manaus (UTC-4)'));
});

test('remarcar abre o formulário já preenchido com a entrevista', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00', { observacao: 'Trazer RG' })]);
  rodar(c, "abrirFormularioEntrevistaRS('c1', 'a')");
  const h = rodar(c, PAINEL);
  assert.ok(
    h.includes('Remarcar entrevista') &&
      h.includes('value="2026-11-12"') &&
      h.includes('value="14:00"') &&
      h.includes('Trazer RG') &&
      h.includes('Salvar novo horário')
  );
});

test('a ficha completa do candidato inclui o painel da agenda', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  assert.ok(
    rodar(c, 'fichaDoCandidatoHtml(state.rs.candidatos[0], state.rs.requisicoes[0])').includes('Entrevistas (0)')
  );
});

// ======================= a página =======================
test('página da agenda: só Administrador e RH; seções, filtro, tabelas acessíveis e botões', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, [cand('c1', 'entrevista_fit')]);
    assert.ok(rodar(c, 'pageAgendaRS()').includes('Você não tem acesso'), String(papel));
  }
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit'), cand('c3', 'entrevista_fit'), cand('c5', 'entrevista_final')],
    [
      ent('hoje', 'c1', HOJE, '15:00'),
      ent('passou', 'c3', HOJE, '09:00'),
      ent('amanha', 'c1', '2026-11-05', '10:00', { etapa: 'entrevista_final' }),
    ]
  );
  const h = rodar(c, 'pageAgendaRS()');
  for (const t of [
    'R&S — Agenda',
    'Para atualizar',
    'Hoje',
    'Próximos 30 dias',
    'quinta-feira, 5 de novembro'.replace('quinta', 'quinta'),
    'Em etapa de entrevista, sem data marcada',
    'Baixar a agenda (.ics)',
    'Todas as vagas',
    'REQ-1 — Vendedor',
    'Enviar lembrete',
    'Realizada',
    'Faltou',
    "agendarDaAgendaRS('c5')",
  ])
    assert.ok(h.includes(t), t);
  assert.ok(
    (h.match(/<caption class="sr-only">/g) || []).length >= 4 &&
      !/<th>/.test(h) &&
      /<th scope="col">Quando<\/th>/.test(h)
  );
  assert.ok(/<label for="rs_ag_vaga"/.test(h));
  assert.ok(h.includes('04/11/2026 às 09:00'), 'a que já passou mostra a data inteira');
});

test('página da agenda: vazia orienta; o filtro de vaga muda o filtro e redesenha; nomes e locais escapados', () => {
  const c = ctx();
  cenario(c, []);
  assert.ok(rodar(c, 'pageAgendaRS()').includes('Nenhuma entrevista marcada.'));
  cenario(
    c,
    [cand('c1', 'entrevista_fit', { nome: '<img src=x onerror=alert(1)>' })],
    [ent('a', 'c1', '2026-11-05', '10:00', { local: '<script>1</script>', entrevistador: '<b>x</b>' })]
  );
  const h = rodar(c, 'pageAgendaRS()');
  assert.ok(!h.includes('<img src=x') && !h.includes('<script>1') && !h.includes('<b>x</b>') && h.includes('&lt;img'));
  rodar(c, "filtrarAgendaRS('v1')");
  assert.equal(rodar(c, '_rsAgendaFiltro.vagaId'), 'v1');
  assert.ok(c.__renders >= 1);
});

test('abrir o candidato ou agendar a partir da agenda leva ao Processo seletivo, na vaga e na ficha certas', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')]);
  rodar(c, "abrirCandidatoDaAgendaRS('c1')");
  assert.deepEqual(
    [plano(c.__gotos), rodar(c, '_rsRequisicaoExpandida'), rodar(c, '_psFichaAberta')],
    [['rs_processo'], 'v1', 'c1']
  );
  rodar(c, "agendarDaAgendaRS('c1')");
  assert.equal(rodar(c, '_rsAgendaForm.candidatoId'), 'c1');
});

// ======================= arquivos baixados =======================
function stubDownload(c) {
  c.Blob = function (partes, opcoes) {
    this.partes = partes;
    this.opcoes = opcoes;
  };
  c.URL = { createObjectURL: (b) => ((c.__blob = b), 'blob:x'), revokeObjectURL() {} };
  c.document = {
    createElement: () => ({
      click() {},
      remove() {},
      set href(v) {},
      set download(v) {
        c.__nomeArquivo = v;
      },
    }),
    body: { appendChild() {} },
  };
}
test('baixar a agenda: arquivo .ics com as entrevistas futuras (nome com a data local); Auditoria só com a contagem', () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [
      ent('a', 'c1', '2026-11-05', '10:00'),
      ent('b', 'c1', '2026-11-06', '10:00'),
      ent('c', 'c1', '2026-11-07', '10:00', { status: 'cancelada' }),
    ]
  );
  stubDownload(c);
  rodar(c, 'baixarAgendaIcsRS()');
  assert.equal(c.__nomeArquivo, 'agenda-entrevistas-2026-11-04.ics');
  assert.equal(c.__blob.opcoes.type, 'text/calendar;charset=utf-8');
  assert.equal((c.__blob.partes[0].match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(c.__blob.partes[0].includes('SUMMARY:Entrevista: Cand c1 — Vendedor'));
  assert.deepEqual(plano(c.__auditoria), [['rs.agenda_exportada', { entrevistas: 2 }]]);
  cenario(c, [], []);
  c.__blob = null;
  rodar(c, 'baixarAgendaIcsRS()');
  assert.equal(c.__blob, null);
  assert.equal(c.__toasts.at(-1), 'Não há entrevistas agendadas nos próximos 30 dias.');
});

test('baixar uma entrevista: arquivo .ics com o nome da data', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  stubDownload(c);
  rodar(c, "baixarIcsEntrevistaRS('a')");
  assert.equal(c.__nomeArquivo, 'entrevista-2026-11-12.ics');
  assert.ok(c.__blob.partes[0].includes('DTSTART:20261112T170000Z'));
});

// ======================= salvamento simultâneo (o que a lista própria resolve) =======================
test('duas pessoas agendando ao mesmo tempo: as DUAS entrevistas sobrevivem ao salvamento seguro', () => {
  const m = carregarArquivos(['js/53-merge-estado.js']);
  const rs = (entrevistas) => ({ requisicoes: [], candidatos: [], entrevistas });
  const e1 = ent('e1', 'c1', '2026-11-12', '14:00');
  const e2 = ent('e2', 'c2', '2026-11-12', '15:00');
  m.__b = { rs: rs([]) };
  m.__m = { rs: rs([e1]) };
  m.__r = { rs: rs([e2]) };
  const r = plano(vm.runInContext('mesclarEstadoRemoto({ base: __b, meu: __m, remoto: __r })', m));
  assert.deepEqual(r.estado.rs.entrevistas.map((e) => e.id).sort(), ['e1', 'e2']);
  assert.deepEqual(r.conflitos, []);
  // a mesma entrevista alterada em campos diferentes por duas pessoas: as duas alterações ficam
  m.__b = { rs: rs([e1]) };
  m.__m = { rs: rs([{ ...e1, hora: '16:00' }]) };
  m.__r = { rs: rs([{ ...e1, observacao: 'Trazer RG' }]) };
  const r2 = plano(vm.runInContext('mesclarEstadoRemoto({ base: __b, meu: __m, remoto: __r })', m));
  assert.deepEqual([r2.estado.rs.entrevistas[0].hora, r2.estado.rs.entrevistas[0].observacao], ['16:00', 'Trazer RG']);
});

// ======================= integração =======================
test('o estado nasce com a lista de entrevistas (inclusive em empresas que já tinham recrutamento)', () => {
  const c = ctx();
  rodar(c, 'state.rs = { requisicoes: [], candidatos: [] }; garantirRS();');
  assert.deepEqual(plano(rodar(c, 'state.rs.entrevistas')), []);
  rodar(c, 'state.rs = { requisicoes: [], candidatos: [], entrevistas: "lixo" }; garantirRS();');
  assert.deepEqual(plano(rodar(c, 'state.rs.entrevistas')), []);
});

test('a rota está no menu (Administrador e RH, grupo Pessoas), no roteador, na regra de acesso, no app.html e na tela do Processo seletivo', () => {
  const nav = ler('js/05-navigation.js');
  assert.ok(/id: 'rs_agenda', label: 'R&S — Agenda', group: 'Pessoas', papeis: \['owner', 'rh'\]/.test(nav));
  assert.ok(/case 'rs_agenda':\s*return true;/.test(nav));
  assert.ok(/case 'rs_agenda':\s*return pageAgendaRS\(\);/.test(ler('js/07-router-dashboard.js')));
  assert.ok(ler('app.html').includes('js/56-rs-agenda.js'));
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
    assert.equal(rodar(c, 'pageProcessoSeletivoRS()').includes("goto('rs_agenda')"), tem, papel);
  }
});

test('desempenho: 3000 entrevistas e 1500 candidatos montam a agenda em menos de 1 s', () => {
  const c = ctx();
  const candidatos = Array.from({ length: 1500 }, (_, i) => cand(`m${i}`, 'entrevista_fit'));
  const entrevistas = Array.from({ length: 3000 }, (_, i) =>
    ent(
      `e${i}`,
      `m${i % 1500}`,
      `2026-11-${String(5 + (i % 25)).padStart(2, '0')}`,
      `${String(8 + (i % 10)).padStart(2, '0')}:00`
    )
  );
  const t0 = Date.now();
  const a = plano(
    rodar(c, `montarAgendaRS(${J({ entrevistas, candidatos, requisicoes: [VAGA], agora: AGORA, hojeISO: HOJE })})`)
  );
  assert.ok(Date.now() - t0 < 1000, `levou ${Date.now() - t0} ms`);
  assert.ok(a.total > 0);
});

test('encostar de verdade: o MESMO candidato com uma entrevista logo depois da outra não conflita; sobrepor 1 minuto conflita', () => {
  const c = ctx();
  const outras = [ent('a', 'c1', '2026-11-12', '14:00', { duracaoMin: 60, entrevistador: 'Paula' })];
  const conf = (nova, candidatoId) =>
    plano(
      rodar(
        c,
        `conflitosEntrevistaRS(${J({ ...ent('n', candidatoId, '2026-11-12', '15:00'), ...nova })}, ${J(candidatoId)}, ${J(outras)}, null)`
      )
    );
  assert.deepEqual(conf({ hora: '15:00' }, 'c1'), [], 'a das 14:00 termina às 15:00 em ponto');
  assert.deepEqual(conf({ hora: '15:00', entrevistador: 'Paula' }, 'c9'), [], 'mesmo entrevistador, também encostando');
  assert.deepEqual(
    conf({ hora: '14:59' }, 'c1').map((k) => k.tipo),
    ['candidato'],
    'um minuto de sobreposição já conflita'
  );
  assert.deepEqual(conf({ hora: '13:00', duracaoMin: 60 }, 'c1'), [], 'a nova termina às 14:00 em ponto');
});

test('a vaga que usa só UMA etapa de entrevista: o formulário e a validação só aceitam essa', async () => {
  const c = ctx();
  const vaga = { ...VAGA, etapasAtivas: ['triagem', 'entrevista_fit'] };
  cenario(c, [cand('c1', 'entrevista_fit')], [], vaga);
  rodar(c, "abrirFormularioEntrevistaRS('c1', null)");
  const h = rodar(c, PAINEL);
  assert.ok(h.includes('Entrevista de fit cultural') && !h.includes('Entrevista final'));
  const r = plano(await salvar(c, 'c1', { etapa: 'entrevista_final' }));
  assert.deepEqual([r.ok, r.erro], [false, 'Escolha a etapa da entrevista.']);
  assert.deepEqual(estadoEnt(c), []);
});
