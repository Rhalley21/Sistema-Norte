// =========================================================================
// WhatsApp e compartilhar a vaga (js/57-rs-compartilhar.js). O relógio é fixo (quarta-feira, 4/11/2026, 12:00 em Brasília).
// Os números de telefone são os do Brasil: DDD de 2 dígitos + 9 dígitos de celular (começando em 9) ou 8 de fixo.
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
const AGORA = Date.parse('2026-11-04T15:00:00Z');

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
    'js/57-rs-compartilhar.js',
  ]);
  Object.assign(c, {
    TextEncoder,
    meuPapelReal: papel,
    meuPerfilId: 'p1',
    empresaIdAtual: 'e1',
    URL,
    __abertos: [],
    __toasts: [],
    __auditoria: [],
    __renders: 0,
    __copiado: null,
  });
  c.render = () => c.__renders++;
  c.showToast = (t) => c.__toasts.push(t);
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.nomePorPerfilId = () => 'Marina Lima';
  c.navigator = { clipboard: { writeText: (t) => (c.__copiado = t) } };
  c.document = {
    createElement: () => {
      const a = {};
      a.click = () => c.__abertos.push({ href: a.href, target: a.target, rel: a.rel });
      a.remove = () => {};
      return a;
    },
    body: { appendChild() {} },
    getElementById: () => null,
  };
  c.sb = { functions: { invoke: async () => ({ data: { vagaPublicaId: 'vp1' }, error: null }) } };
  fixarRelogio(c, AGORA);
  return c;
}
const VAGA = {
  id: 'v1',
  codigo: 'REQ-1',
  cargoId: 'cg',
  status: 'aprovada',
  publicada: true,
  vagaPublicaId: 'vp1',
  etapasAtivas: ['triagem', 'entrevista_fit'],
  perfilDesejado: {
    cidade: 'Teresina - PI',
    principaisAtividades: 'Atender clientes, organizar vitrine, fechar caixa',
  },
  publico: { titulo: 'Vendedor', modalidade: 'Presencial', mostrarEmpresa: true, local: 'Teresina - PI' },
};
const cand = (id, etapa, extra) => ({
  id,
  vagaId: 'v1',
  nome: `Ana Souza ${id}`,
  email: `${id}@x.com`,
  telefone: '(89) 99999-1234',
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
function cenario(c, candidatos, entrevistas = [], vaga = VAGA, empresa = { nomeFantasia: 'Loja Aurora' }) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = []; state.empresa = ${J(empresa)}; state.rs = { requisicoes: [${J(vaga)}], candidatos: ${J(candidatos)}, entrevistas: ${J(entrevistas)}, configEtapas: {} }; _rsRequisicaoExpandida = 'v1'; _rsWhatsApp = null; _rsAgendaForm = null; _psFichaAberta = null;`
  );
}
const tel = (c, t) => plano(rodar(c, `telefoneParaWhatsAppRS(${J(t)})`));

// ======================= telefone =======================
test('telefone do Brasil: vários jeitos de escrever chegam ao mesmo número com 55', () => {
  const c = ctx();
  for (const t of [
    '(89) 99999-1234',
    '89999991234',
    '89 9 9999-1234',
    '+55 89 99999-1234',
    '5589999991234',
    '55 (89) 99999-1234',
    '089 99999-1234',
    '0 89 99999 1234',
    '  (89)99999.1234  ',
  ])
    assert.deepEqual(tel(c, t), { ok: true, numero: '5589999991234' }, t);
  assert.deepEqual(tel(c, '(11) 98765-4321'), { ok: true, numero: '5511987654321' });
  assert.deepEqual(
    tel(c, '(55) 99999-1234'),
    { ok: true, numero: '5555999991234' },
    'DDD 55 (Santa Maria) não é confundido com o código do país'
  );
});

test('telefone: fixo e celular antigo (sem o 9) valem, mas com aviso claro', () => {
  const c = ctx();
  const fixo = tel(c, '(89) 3222-1234');
  assert.deepEqual([fixo.ok, fixo.numero], [true, '558932221234']);
  assert.match(fixo.aviso, /fixo/);
  const antigo = tel(c, '(89) 8807-5328');
  assert.deepEqual([antigo.ok, antigo.numero], [true, '558988075328']);
  assert.match(antigo.aviso, /faltar o 9/);
  assert.equal(tel(c, '(89) 99999-1234').aviso, undefined);
});

test('telefone: o que não dá para usar volta com o motivo (vazio, curto, DDD ruim, celular sem 9, número sem país)', () => {
  const c = ctx();
  const motivo = (t) => tel(c, t).motivo;
  assert.equal(motivo(''), 'O candidato não tem telefone cadastrado.');
  assert.equal(motivo(null), 'O candidato não tem telefone cadastrado.');
  assert.equal(motivo(undefined), 'O candidato não tem telefone cadastrado.');
  assert.equal(motivo('   '), 'O candidato não tem telefone cadastrado.');
  for (const t of ['12345', 'abc', '99999-123', '(89) 9999-12345678', '5589999', '+55 89 999', '1234567890123'])
    assert.equal(motivo(t), 'O telefone parece incompleto ou inválido.', t);
  assert.equal(motivo('(10) 99999-1234'), 'O DDD do telefone parece inválido.');
  assert.equal(
    motivo('(00) 99999-1234'),
    'O telefone parece incompleto ou inválido.',
    'o zero inicial é prefixo de discagem, não DDD'
  );
  assert.equal(motivo('(89) 79999-1234'), 'O número de celular deve começar com 9 depois do DDD.');
});

test('telefone de outro país (com +): vale se tiver tamanho de telefone internacional', () => {
  const c = ctx();
  assert.deepEqual(tel(c, '+1 415 555 0172'), { ok: true, numero: '14155550172' });
  assert.deepEqual(tel(c, '+351 912 345 678'), { ok: true, numero: '351912345678' });
  assert.equal(tel(c, '+1 41').ok, false);
  assert.equal(tel(c, '+1234567890123456').ok, false, 'mais de 15 dígitos');
});

test('link do WhatsApp: número, texto codificado (acento, quebra de linha, & e #) e corte em 1000 caracteres', () => {
  const c = ctx();
  const l = (n, t) => rodar(c, `linkWhatsAppRS(${J(n)}, ${J(t)})`);
  assert.equal(
    l('5589999991234', 'Olá, Ana! É às 14:00 & 15:00 #1\nAté lá'),
    'https://wa.me/5589999991234?text=Ol%C3%A1%2C%20Ana!%20%C3%89%20%C3%A0s%2014%3A00%20%26%2015%3A00%20%231%0AAt%C3%A9%20l%C3%A1'
  );
  const longo = l('5589999991234', 'x'.repeat(5000));
  assert.equal(decodeURIComponent(longo.split('text=')[1]).length, 1000);
  assert.equal(l('5589999991234', undefined), 'https://wa.me/5589999991234?text=');
});

// ======================= mensagens =======================
test('primeiro nome: só a primeira palavra, com a inicial maiúscula', () => {
  const c = ctx();
  const p = (n) => rodar(c, `primeiroNomeRS(${J(n)})`);
  assert.deepEqual(['  maria da silva', 'JOÃO PEDRO', 'Ana', '', null, undefined].map(p), [
    'Maria',
    'João',
    'Ana',
    '',
    '',
    '',
  ]);
});

test('modelos: sem entrevista só há o primeiro contato; com entrevista, também "entrevista marcada" e "lembrete"', () => {
  const c = ctx();
  const m = (extra) =>
    plano(
      rodar(
        c,
        `modelosWhatsAppRS(${J({ candidato: { nome: 'Ana Souza' }, nomeVaga: 'Vendedor', empresaNome: 'Loja Aurora', remetente: 'Marina', entrevista: null, ...extra })})`
      )
    );
  const sem = m({});
  assert.deepEqual(
    sem.map((x) => x.id),
    ['contato']
  );
  assert.equal(
    sem[0].texto,
    'Olá, Ana! Aqui é Marina, do RH da Loja Aurora. Recebi a sua candidatura para a vaga de Vendedor e gostaria de conversar com você. Podemos falar agora?'
  );
  const com = m({ entrevista: ent('i', 'c1', '2026-11-12', '14:00') });
  assert.deepEqual(
    com.map((x) => x.id),
    ['contato', 'entrevista', 'lembrete']
  );
  assert.equal(
    com[1].texto,
    'Olá, Ana! Sua entrevista para a vaga de Vendedor está marcada para quinta-feira, 12 de novembro de 2026, às 14:00 (horário de Brasília), online: https://meet.google.com/abc-defg-hij. Você confirma presença?'
  );
  assert.equal(
    com[2].texto,
    'Olá, Ana! Passando para lembrar da sua entrevista para a vaga de Vendedor: quinta-feira, 12 de novembro de 2026, às 14:00 (horário de Brasília), online: https://meet.google.com/abc-defg-hij. Até lá!'
  );
});

test('modelos: sem remetente nem empresa a mensagem não inventa nada; o formato muda o final da frase', () => {
  const c = ctx();
  const m = (extra) =>
    plano(
      rodar(
        c,
        `modelosWhatsAppRS(${J({ candidato: { nome: '' }, nomeVaga: 'Vendedor', empresaNome: '', remetente: '', entrevista: null, ...extra })})`
      )
    );
  assert.equal(
    m({})[0].texto,
    'Olá! Aqui é do RH. Recebi a sua candidatura para a vaga de Vendedor e gostaria de conversar com você. Podemos falar agora?'
  );
  const fim = (e) =>
    m({ entrevista: ent('i', 'c1', '2026-11-12', '14:00', e) })[1].texto.replace(
      /^.*às 14:00 \(horário de Brasília\), /,
      ''
    );
  assert.equal(
    fim({ formato: 'presencial', local: 'Rua das Flores, 100' }),
    'no endereço: Rua das Flores, 100. Você confirma presença?'
  );
  assert.equal(fim({ formato: 'telefone', local: '' }), 'por telefone. Você confirma presença?');
  assert.equal(
    fim({ formato: 'telefone', local: '(89) 99999-0000' }),
    'por telefone: (89) 99999-0000. Você confirma presença?'
  );
});

test('modelos do candidato: usa o nome de quem está logado e a empresa; vaga confidencial não cita a empresa; só a PRÓXIMA entrevista agendada conta', () => {
  const c = ctx();
  cenario(
    c,
    [cand('c1', 'entrevista_fit')],
    [
      ent('passada', 'c1', '2026-11-03', '10:00'),
      ent('cancelada', 'c1', '2026-11-05', '10:00', { status: 'cancelada' }),
      ent('prox', 'c1', '2026-11-12', '14:00'),
      ent('depois', 'c1', '2026-11-20', '14:00'),
    ]
  );
  const ms = plano(rodar(c, 'modelosDoCandidatoRS(state.rs.candidatos[0], Date.now())'));
  assert.deepEqual(
    ms.map((x) => x.id),
    ['contato', 'entrevista', 'lembrete']
  );
  assert.ok(ms[0].texto.includes('Aqui é Marina, do RH da Loja Aurora.'));
  assert.ok(
    ms[1].texto.includes('quinta-feira, 12 de novembro') && !ms[1].texto.includes('20 de novembro'),
    'a mais próxima que ainda não aconteceu'
  );
  cenario(c, [cand('c1', 'entrevista_fit')], [], { ...VAGA, confidencial: true });
  const conf = plano(rodar(c, 'modelosDoCandidatoRS(state.rs.candidatos[0], Date.now())'));
  assert.ok(conf[0].texto.includes('Aqui é Marina, do RH.') && !conf[0].texto.includes('Loja Aurora'));
});

// ======================= o anúncio =======================
test('primeira frase: a primeira linha com texto, sem pontuação no fim e cortada com reticências', () => {
  const c = ctx();
  const f = (t, n) => rodar(c, `primeiraFraseRS(${J(t)}, ${n})`);
  assert.equal(f('\n  \nAtender clientes;\nOutra linha', 140), 'Atender clientes');
  assert.equal(f('Atender clientes.', 140), 'Atender clientes');
  assert.equal(f('', 140), '');
  assert.equal(f(null, 140), '');
  const corta = f('a'.repeat(300), 20);
  assert.equal(corta.length, 20);
  assert.ok(corta.endsWith('…'));
});

test('dados públicos: usa o que foi publicado; vaga confidencial não revela cargo nem empresa; vaga antiga cai num padrão conservador', () => {
  const c = ctx();
  const d = (r, empresa = { nomeFantasia: 'Loja Aurora' }) =>
    plano(rodar(c, `dadosPublicosDaVagaRS(${J(r)}, [{ id: 'cg', nome: 'Vendedor' }], ${J(empresa)})`));
  assert.deepEqual(d(VAGA), {
    titulo: 'Vendedor',
    cidade: 'Teresina - PI',
    modalidade: 'Presencial',
    empresaNome: 'Loja Aurora',
    atividades: 'Atender clientes, organizar vitrine, fechar caixa',
  });
  assert.equal(
    d({ ...VAGA, publico: { ...VAGA.publico, mostrarEmpresa: false } }).empresaNome,
    '',
    'o RH escolheu não mostrar a empresa'
  );
  const conf = d({ ...VAGA, confidencial: true, publico: undefined });
  assert.deepEqual([conf.titulo, conf.empresaNome, conf.modalidade], ['Vaga em aberto', '', '']);
  assert.equal(
    d({ ...VAGA, confidencial: true, publico: { titulo: 'Oportunidade no varejo', mostrarEmpresa: true } }).empresaNome,
    '',
    'confidencial nunca mostra a empresa, mesmo que o RH tenha marcado'
  );
  assert.equal(
    d({ ...VAGA, confidencial: true, publico: { titulo: 'Oportunidade no varejo', mostrarEmpresa: true } }).titulo,
    'Oportunidade no varejo',
    'o título que o RH escolheu para a vaga confidencial vale'
  );
  const antiga = d({ ...VAGA, publico: undefined });
  assert.deepEqual(
    [antiga.titulo, antiga.empresaNome, antiga.modalidade, antiga.cidade],
    ['Vendedor', '', '', 'Teresina - PI'],
    'sem o registro do que foi publicado, não cita empresa'
  );
  assert.equal(
    d({ ...VAGA, perfilDesejado: { missaoHerdada: 'x' }, missaoHerdada: 'Missão do cargo', publico: undefined })
      .atividades,
    'Missão do cargo'
  );
});

test('texto do anúncio: com e sem empresa, cidade, modalidade e atividades', () => {
  const c = ctx();
  const t = (d) =>
    rodar(
      c,
      `textoAnuncioVagaRS(${J({ titulo: 'Vendedor', cidade: '', modalidade: '', empresaNome: '', atividades: '', link: 'https://x.test/vaga.html?v=1', ...d })})`
    );
  assert.equal(
    t({
      cidade: 'Teresina - PI',
      modalidade: 'Presencial',
      empresaNome: 'Loja Aurora',
      atividades: 'Atender clientes',
    }),
    'Loja Aurora está contratando: Vendedor, em Teresina - PI (presencial). Atender clientes. Candidate-se pelo link: https://x.test/vaga.html?v=1'
  );
  assert.equal(t({}), 'Estamos contratando: Vendedor. Candidate-se pelo link: https://x.test/vaga.html?v=1');
  assert.equal(
    t({ cidade: 'Teresina - PI' }),
    'Estamos contratando: Vendedor, em Teresina - PI. Candidate-se pelo link: https://x.test/vaga.html?v=1'
  );
});

test('endereços de compartilhar: codificados e prontos para abrir', () => {
  const c = ctx();
  assert.equal(
    rodar(c, "linkCompartilharWhatsAppRS('Vaga & cia: link?')"),
    'https://wa.me/?text=Vaga%20%26%20cia%3A%20link%3F'
  );
  assert.equal(
    rodar(c, "linkCompartilharLinkedInRS('https://x.test/vaga.html?v=1&a=b')"),
    'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.test%2Fvaga.html%3Fv%3D1%26a%3Db'
  );
  assert.equal(
    rodar(c, "linkCompartilharEmailRS('Vaga: Vendedor', 'Olá\\nLink')"),
    'mailto:?subject=Vaga%3A%20Vendedor&body=Ol%C3%A1%0ALink'
  );
});

// ======================= abrir o WhatsApp =======================
test('abrir o WhatsApp: abre uma aba nova com o texto do campo, registra QUANDO abriu e a Auditoria guarda só a contagem', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  c.document.getElementById = (id) => (id === 'rs_wa_texto' ? { value: 'Olá, Ana! Texto editado.' } : null);
  rodar(c, "abrirWhatsAppRS('c1')");
  assert.deepEqual(plano(c.__abertos), [
    {
      href: 'https://wa.me/5589999991234?text=Ol%C3%A1%2C%20Ana!%20Texto%20editado.',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
  ]);
  const u = plano(rodar(c, 'state.rs.candidatos[0].ultimoWhatsApp'));
  assert.deepEqual([u.autorId, u.em], ['p1', '2026-11-04T15:00:00.000Z']);
  assert.deepEqual(plano(c.__auditoria), [['rs.whatsapp_aberto', { vagaId: 'v1' }]]);
  assert.ok(
    !J(c.__auditoria).includes('Ana') &&
      !J(c.__auditoria).includes('9999') &&
      !J(c.__auditoria).includes('Texto editado')
  );
  assert.equal(c.__toasts[0], 'WhatsApp aberto. Confira a mensagem e envie por lá.');
});

test('abrir o WhatsApp com o texto dado (vindo da agenda) ignora o campo da tela', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  c.document.getElementById = () => ({ value: 'não deve usar' });
  rodar(c, "abrirWhatsAppRS('c1', 'Lembrete pronto')");
  assert.ok(c.__abertos[0].href.endsWith('text=Lembrete%20pronto'));
});

test('telefone inválido ou ausente: não abre nada, não registra contato e explica o motivo', () => {
  for (const telefone of ['', '12345', '(10) 99999-1234']) {
    const c = ctx();
    cenario(c, [cand('c1', 'triagem', { telefone })]);
    rodar(c, "abrirWhatsAppRS('c1', 'x')");
    assert.deepEqual(plano(c.__abertos), [], telefone);
    assert.equal(rodar(c, 'state.rs.candidatos[0].ultimoWhatsApp'), undefined);
    assert.deepEqual(plano(c.__auditoria), []);
    assert.ok(c.__toasts.length === 1 && c.__toasts[0].length > 10);
  }
});

test('só Administrador e RH usam o WhatsApp do recrutamento; candidato inexistente não faz nada', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, [cand('c1', 'triagem')]);
    rodar(c, "abrirWhatsAppRS('c1', 'x'); abrirPainelWhatsAppRS('c1'); abrirWhatsAppDaAgendaRS('c1');");
    assert.deepEqual(plano(c.__abertos), [], String(papel));
    assert.equal(rodar(c, '_rsWhatsApp'), null);
    assert.equal(rodar(c, 'whatsAppBotaoHtml(state.rs.candidatos[0])'), '');
  }
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  rodar(c, "abrirWhatsAppRS('nao-existe', 'x')");
  assert.deepEqual(plano(c.__abertos), []);
});

test('da agenda: abre direto com o lembrete; sem entrevista marcada avisa', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit'), cand('c2', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  rodar(c, "abrirWhatsAppDaAgendaRS('c1')");
  assert.equal(c.__abertos.length, 1);
  assert.ok(decodeURIComponent(c.__abertos[0].href).includes('Passando para lembrar da sua entrevista'));
  rodar(c, "abrirWhatsAppDaAgendaRS('c2')");
  assert.equal(c.__abertos.length, 1);
  assert.equal(c.__toasts.at(-1), 'Este candidato não tem entrevista agendada.');
});

// ======================= a ficha =======================
test('botão e painel na ficha: abre e fecha; mostra os modelos com o selecionado marcado; o campo vem preenchido e escapado', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit', { nome: '<b>Ana</b> Souza' })], [ent('a', 'c1', '2026-11-12', '14:00')]);
  const botao = () => rodar(c, 'whatsAppBotaoHtml(state.rs.candidatos[0])');
  assert.ok(botao().includes('aria-expanded="false"') && botao().includes('>WhatsApp<'));
  assert.equal(rodar(c, 'whatsAppPainelHtml(state.rs.candidatos[0])'), '', 'fechado');
  rodar(c, "abrirPainelWhatsAppRS('c1')");
  assert.ok(botao().includes('aria-expanded="true"'));
  const h = rodar(c, 'whatsAppPainelHtml(state.rs.candidatos[0])');
  for (const t of [
    'aria-label="Mensagem de WhatsApp"',
    'Primeiro contato',
    'Entrevista marcada',
    'Lembrete',
    'aria-pressed="true"',
    'aria-pressed="false"',
    '<label for="rs_wa_texto"',
    'Você pode editar o texto antes de abrir',
    "abrirWhatsAppRS('c1')",
    'O sistema não envia nada',
  ])
    assert.ok(h.includes(t), t);
  assert.ok(!h.includes('<b>') && h.includes('&lt;b&gt;'), 'nome escapado');
  rodar(c, "escolherModeloWhatsAppRS('lembrete')");
  assert.ok(rodar(c, 'whatsAppPainelHtml(state.rs.candidatos[0])').includes('Passando para lembrar'));
  rodar(c, "abrirPainelWhatsAppRS('c1')");
  assert.equal(rodar(c, '_rsWhatsApp'), null, 'clicar de novo fecha');
});

test('painel com telefone ruim: explica o que corrigir e não oferece o botão de abrir; botão da ficha traz o motivo', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem', { telefone: '' })]);
  assert.ok(
    rodar(c, 'whatsAppBotaoHtml(state.rs.candidatos[0])').includes('title="O candidato não tem telefone cadastrado."')
  );
  rodar(c, "abrirPainelWhatsAppRS('c1')");
  const h = rodar(c, 'whatsAppPainelHtml(state.rs.candidatos[0])');
  assert.ok(
    h.includes('role="alert"') && h.includes('Corrija o telefone no cadastro') && !h.includes('Abrir no WhatsApp')
  );
});

test('painel: aviso de número fixo e a data do último WhatsApp aberto', () => {
  const c = ctx();
  cenario(c, [
    cand('c1', 'triagem', {
      telefone: '(89) 3222-1234',
      ultimoWhatsApp: { em: '2026-11-03T18:30:00Z', autorId: 'p1' },
    }),
  ]);
  rodar(c, "abrirPainelWhatsAppRS('c1')");
  const h = rodar(c, 'whatsAppPainelHtml(state.rs.candidatos[0])');
  assert.ok(h.includes('parece fixo') && h.includes('Último WhatsApp aberto:'));
  assert.ok(/Último WhatsApp aberto: \d{2}\/\d{2}\/\d{2,4}/.test(h));
});

test('a ficha do candidato traz o botão (ao lado das ações) e o painel quando aberto', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  assert.ok(rodar(c, 'fichaDoCandidatoHtml(state.rs.candidatos[0], state.rs.requisicoes[0])').includes('>WhatsApp<'));
  rodar(c, "abrirPainelWhatsAppRS('c1')");
  assert.ok(
    rodar(c, 'fichaDoCandidatoHtml(state.rs.candidatos[0], state.rs.requisicoes[0])').includes(
      'Mensagem pronta para o WhatsApp'
    )
  );
  const lider = ctx('lider');
  cenario(lider, [cand('c1', 'triagem')]);
  assert.ok(
    !rodar(lider, 'fichaDoCandidatoHtml(state.rs.candidatos[0], state.rs.requisicoes[0])').includes('>WhatsApp<')
  );
});

test('a página da agenda traz o botão de WhatsApp nas entrevistas de hoje e das próximas semanas', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'entrevista_fit')], [ent('a', 'c1', '2026-11-12', '14:00')]);
  assert.ok(rodar(c, 'pageAgendaRS()').includes("abrirWhatsAppDaAgendaRS('c1')"));
});

// ======================= compartilhar a vaga =======================
test('compartilhar: WhatsApp, LinkedIn, e-mail e copiar o texto, cada um com o endereço certo; Auditoria só com o canal', () => {
  const c = ctx();
  cenario(c, [cand('c1', 'triagem')]);
  rodar(c, "linkPublicoRS = () => 'https://x.test/vaga.html?v=vp1';");
  const esperado =
    'Loja Aurora está contratando: Vendedor, em Teresina - PI (presencial). Atender clientes, organizar vitrine, fechar caixa. Candidate-se pelo link: https://x.test/vaga.html?v=vp1';
  rodar(c, "compartilharVagaRS('v1', 'whatsapp')");
  assert.equal(c.__abertos[0].href, `https://wa.me/?text=${encodeURIComponent(esperado)}`);
  rodar(c, "compartilharVagaRS('v1', 'linkedin')");
  assert.equal(
    c.__abertos[1].href,
    'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fx.test%2Fvaga.html%3Fv%3Dvp1'
  );
  rodar(c, "compartilharVagaRS('v1', 'email')");
  assert.equal(
    c.__abertos[2].href,
    `mailto:?subject=${encodeURIComponent('Vaga: Vendedor')}&body=${encodeURIComponent(esperado)}`
  );
  rodar(c, "compartilharVagaRS('v1', 'texto')");
  assert.equal(c.__copiado, esperado);
  assert.equal(c.__toasts.at(-1), 'Texto do anúncio copiado! Cole onde quiser divulgar.');
  assert.deepEqual(
    plano(c.__auditoria).map((a) => a[1].canal),
    ['whatsapp', 'linkedin', 'email', 'texto']
  );
  assert.ok(!J(c.__auditoria).includes('Aurora') && !J(c.__auditoria).includes('x.test'));
  assert.ok(c.__abertos.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer'));
});

test('compartilhar: vaga confidencial não vaza o cargo nem a empresa no texto', () => {
  const c = ctx();
  cenario(c, [], [], { ...VAGA, confidencial: true, publico: undefined });
  rodar(c, "linkPublicoRS = () => 'https://x.test/v';");
  rodar(c, "compartilharVagaRS('v1', 'texto')");
  assert.ok(!c.__copiado.includes('Vendedor') && !c.__copiado.includes('Aurora'));
  assert.ok(c.__copiado.startsWith('Estamos contratando: Vaga em aberto'));
});

test('compartilhar: só vaga publicada e aberta; canal desconhecido não faz nada; só Administrador e RH', () => {
  const c = ctx();
  cenario(c, [], [], { ...VAGA, encerrada: true });
  rodar(c, "compartilharVagaRS('v1', 'texto')");
  assert.equal(c.__copiado, null);
  assert.equal(c.__toasts.at(-1), 'Esta vaga não está publicada.');
  cenario(c, [], [], { ...VAGA, publicada: false });
  rodar(c, "compartilharVagaRS('v1', 'texto')");
  assert.equal(c.__copiado, null);
  cenario(c, [], []);
  rodar(c, "linkPublicoRS = () => 'https://x.test/v'; compartilharVagaRS('v1', 'fax')");
  assert.deepEqual([plano(c.__abertos), c.__copiado, plano(c.__auditoria)], [[], null, []]);
  const lider = ctx('lider');
  cenario(lider, [], []);
  rodar(lider, "linkPublicoRS = () => 'https://x.test/v'; compartilharVagaRS('v1', 'texto')");
  assert.equal(lider.__copiado, null);
});

test('a linha de divulgação do cartão da vaga: só para vaga publicada e aberta, só Administrador e RH, e avisa que a prévia ainda é genérica', () => {
  const c = ctx();
  const linha = (r) => rodar(c, `compartilharVagaHtml(${J(r)})`);
  const h = linha(VAGA);
  for (const t of [
    'Divulgar:',
    "compartilharVagaRS('v1', 'whatsapp')",
    "compartilharVagaRS('v1', 'linkedin')",
    "compartilharVagaRS('v1', 'email')",
    "compartilharVagaRS('v1', 'texto')",
    'Copiar texto do anúncio',
    'prévia do link',
    'genérico',
  ])
    assert.ok(h.includes(t), t);
  assert.equal(linha({ ...VAGA, publicada: false }), '');
  assert.equal(linha({ ...VAGA, encerrada: true }), '');
  assert.equal(linha({ ...VAGA, vagaPublicaId: undefined }), '');
  assert.equal(rodar(ctx('lider'), `compartilharVagaHtml(${J(VAGA)})`), '');
  assert.ok(
    ler('js/40-page-rs.js').includes('compartilharVagaHtml(r)'),
    'o cartão da vaga chama a linha de divulgação'
  );
});

// ======================= publicar guarda o que ficou público =======================
test('publicar a vaga guarda o que a página pública mostra (título, modalidade, empresa visível e local)', async () => {
  const c = ctx();
  cenario(c, [], [], {
    id: 'v1',
    cargoId: 'cg',
    status: 'aprovada',
    perfilDesejado: { cidade: 'Teresina - PI', principaisAtividades: 'Atender' },
  });
  const campos = {
    rs_pub_titulo: { value: '  Vendedor de loja ' },
    rs_pub_modalidade: { value: 'Híbrido' },
    rs_pub_mostrar_salario: { checked: false },
    rs_pub_faixa: { value: '' },
    rs_pub_mostrar_empresa: { checked: true },
  };
  c.document.getElementById = (id) => campos[id] || null;
  const enviado = [];
  c.sb.functions.invoke = async (nome, { body }) => (
    enviado.push([nome, body]),
    { data: { vagaPublicaId: 'vp9' }, error: null }
  );
  await rodar(c, "publicarVagaRS('v1')");
  const r = plano(rodar(c, 'state.rs.requisicoes[0]'));
  assert.deepEqual(r.publico, {
    titulo: 'Vendedor de loja',
    modalidade: 'Híbrido',
    mostrarEmpresa: true,
    local: 'Teresina - PI',
  });
  assert.equal(r.vagaPublicaId, 'vp9');
  assert.equal(enviado[0][1].titulo, 'Vendedor de loja');
  // e um erro do servidor NÃO grava nada
  const c2 = ctx();
  cenario(c2, [], [], { id: 'v1', cargoId: 'cg', status: 'aprovada', perfilDesejado: {} });
  c2.document.getElementById = (id) => campos[id] || null;
  c2.sb.functions.invoke = async () => ({ data: { error: 'falhou' }, error: null });
  await rodar(c2, "publicarVagaRS('v1')");
  assert.equal(rodar(c2, 'state.rs.requisicoes[0].publico'), undefined);
});

// ======================= integração =======================
test('o módulo está no app.html e a Central de Ajuda explica o WhatsApp e a divulgação', () => {
  assert.ok(ler('app.html').includes('js/57-rs-compartilhar.js'));
  const faq = ler('js/41-page-central-ajuda.js');
  assert.ok(faq.includes('Posso chamar um candidato pelo WhatsApp?') && faq.includes('Como divulgo a vaga'));
});

test('o anúncio traz só o começo das atividades: no máximo 140 caracteres, cortado com reticências', () => {
  const c = ctx();
  const longa = `${'Atender clientes com atenção e cuidar da vitrine. '.repeat(10)}`;
  const d = plano(
    rodar(
      c,
      `dadosPublicosDaVagaRS(${J({ ...VAGA, perfilDesejado: { principaisAtividades: longa } })}, [{ id: 'cg', nome: 'Vendedor' }], { nomeFantasia: 'Loja Aurora' })`
    )
  );
  assert.equal(d.atividades.length, 140);
  assert.ok(d.atividades.endsWith('…'));
  assert.ok(longa.length > 400);
});
