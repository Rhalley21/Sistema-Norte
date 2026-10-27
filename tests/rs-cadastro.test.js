// =========================================================================
// Recrutamento = cadastro de pessoas. Garantias: cada pessoa aparece UMA vez (mesmo com vários processos);
// levar para uma vaga não apaga o histórico de processos anteriores; não dá pra levar quem já está em um
// processo; excluir apaga a pessoa inteira (com travas); só Administrador e RH acessam; o banco de talentos só
// é mostrado (entra sozinho por autorização no formulário); tudo que vem de fora sai escapado.
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
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
    'js/47-rs-cadastro.js',
  ]);
  c.meuPapelReal = papel;
  c.meuPerfilId = 'perfil1';
  c.URL = URL;
  c.__toasts = [];
  c.__renders = 0;
  c.__gotos = [];
  c.__invocacoes = [];
  c.__auditoria = [];
  let n = 0;
  c.uid = () => `id${++n}`;
  c.novoCarimbo = () => ({ criadoEm: `2026-10-${String(10 + n).padStart(2, '0')}T12:00:00.000Z` });
  c.confirm = () => true;
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.goto = (id) => c.__gotos.push(id);
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.sb = {
    functions: { invoke: async (nome, o) => (c.__invocacoes.push({ nome, body: o.body }), { data: {}, error: null }) },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));
function campos(c, mapa) {
  c.document.getElementById = (id) => (id in mapa ? { value: mapa[id] } : null);
}
function cenario(c, candidatos, extra = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }, { id: 'cf', nome: 'Analista' }];
    state.estrutura = [];
    state.rs = { candidatos: ${J(candidatos)}, requisicoes: ${J(
      extra.requisicoes || [
        { id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', publicada: true },
        { id: 'v2', codigo: 'REQ-002', cargoId: 'cf', status: 'aprovada' },
        { id: 'v3', codigo: 'REQ-003', cargoId: 'cg', status: 'pendente' },
        { id: 'v4', codigo: 'REQ-004', cargoId: 'cg', status: 'aprovada', encerrada: true },
      ]
    )}, configEtapas: {} };`
  );
}
const P = (extra) => ({
  id: 'x',
  nome: 'Pessoa',
  email: '',
  telefone: '',
  origem: 'Cadastro manual',
  curriculo: '',
  vagaId: null,
  etapa: null,
  reprovado: false,
  historico: [],
  criadoEm: '2026-10-01T12:00:00.000Z',
  ...extra,
});

// ======================= funções puras =======================
test('quem é "a mesma pessoa": e-mail (sem diferenciar maiúsculas/espaços); sem e-mail, telefone com 8+ dígitos; senão, o próprio registro', () => {
  const c = ctx();
  const k = (o) => rodar(c, `chaveDaPessoaRS(${J(o)})`);
  assert.equal(k({ id: '1', email: ' Ana@X.com ' }), 'e:ana@x.com');
  assert.equal(k({ id: '2', email: 'ana@x.com' }), 'e:ana@x.com');
  assert.equal(k({ id: '3', email: '', telefone: '(11) 98888-7777' }), 't:11988887777');
  assert.equal(k({ id: '4', email: '', telefone: '123' }), 'i:4');
  assert.equal(k({ id: '5' }), 'i:5');
});

test('situação de um registro: contratada, só cadastrada, reprovada ou em processo', () => {
  const c = ctx();
  const s = (o) => rodar(c, `situacaoDoRegistroRS(${J(o)})`);
  assert.equal(s({ vagaId: null }), 'cadastrada');
  assert.equal(s({ vagaId: 'v1', etapa: 'triagem' }), 'em_processo');
  assert.equal(s({ vagaId: 'v1', etapa: 'triagem', reprovado: true }), 'reprovada');
  assert.equal(s({ vagaId: 'v1', etapa: 'aprovado', convertidoEm: '2026-10-01' }), 'contratada');
  assert.equal(
    s({ vagaId: 'v1', reprovado: true, convertidoEm: '2026-10-01' }),
    'contratada',
    'contratada vale mais que reprovada'
  );
});

test('CADA PESSOA UMA VEZ: registros de várias vagas com o mesmo e-mail viram uma pessoa com todos os processos; os dados vêm do mais recente', () => {
  const c = ctx();
  const cands = [
    P({
      id: 'a',
      nome: 'Ana Souza',
      email: 'ana@x.com',
      vagaId: 'v1',
      etapa: 'reprovado',
      reprovado: true,
      criadoEm: '2026-09-01T12:00:00Z',
      telefone: '111',
    }),
    P({
      id: 'b',
      nome: 'Ana S. Souza',
      email: 'ANA@x.com',
      vagaId: 'v2',
      etapa: 'triagem',
      criadoEm: '2026-10-05T12:00:00Z',
      telefone: '222',
    }),
    P({ id: 'c', nome: 'Bruno', email: 'bruno@x.com' }),
    P({ id: 'd', nome: 'Carla', telefone: '(11) 91111-2222' }),
    P({
      id: 'e',
      nome: 'Carla Dias',
      telefone: '11911112222',
      vagaId: 'v1',
      etapa: 'video',
      criadoEm: '2026-10-02T12:00:00Z',
    }),
    P({ id: 'f', nome: 'Sem contato A' }),
    P({ id: 'g', nome: 'Sem contato B' }),
  ];
  const g = plano(
    rodar(
      c,
      `agruparPessoasRS(${J(cands)}).map((p) => ({ nome: p.principal.nome, processos: p.processos.length, registros: p.registros.length, situacao: p.situacao }))`
    )
  );
  assert.deepEqual(g, [
    { nome: 'Ana S. Souza', processos: 2, registros: 2, situacao: 'em_processo' },
    { nome: 'Bruno', processos: 0, registros: 1, situacao: 'cadastrada' },
    { nome: 'Carla Dias', processos: 1, registros: 2, situacao: 'em_processo' },
    { nome: 'Sem contato A', processos: 0, registros: 1, situacao: 'cadastrada' },
    { nome: 'Sem contato B', processos: 0, registros: 1, situacao: 'cadastrada' },
  ]);
});

test('situação da pessoa: em processo vale mais que contratada, que vale mais que reprovada; só reprovadas = reprovada', () => {
  const c = ctx();
  const sit = (regs) =>
    rodar(c, `agruparPessoasRS(${J(regs.map((r, i) => P({ id: `r${i}`, email: 'a@x.com', ...r })))})[0].situacao`);
  assert.equal(
    sit([
      { vagaId: 'v1', reprovado: true },
      { vagaId: 'v2', etapa: 'video' },
    ]),
    'em_processo'
  );
  assert.equal(
    sit([
      { vagaId: 'v1', reprovado: true },
      { vagaId: 'v2', convertidoEm: 'x', etapa: 'aprovado' },
    ]),
    'contratada'
  );
  assert.equal(
    sit([
      { vagaId: 'v1', reprovado: true },
      { vagaId: 'v2', reprovado: true },
    ]),
    'reprovada'
  );
  assert.equal(sit([{}]), 'cadastrada');
});

test('busca: todas as palavras, sem diferenciar acento/maiúscula, em nome, e-mail, telefone e origem; filtro de situação', () => {
  const c = ctx();
  const cands = [
    P({ id: 'a', nome: 'José Antônio', email: 'jose@x.com', origem: 'LinkedIn' }),
    P({ id: 'b', nome: 'Maria', email: 'maria@x.com', telefone: '11 98888', vagaId: 'v1', etapa: 'triagem' }),
    P({ id: 'c', nome: 'Pedro', vagaId: 'v1', reprovado: true, email: 'p@x.com' }),
  ];
  const f = (filtro) =>
    plano(rodar(c, `filtrarPessoasRS(agruparPessoasRS(${J(cands)}), ${J(filtro)}).map((p) => p.principal.nome)`));
  assert.deepEqual(f({ busca: 'jose antonio', situacao: 'todas' }), ['José Antônio']);
  assert.deepEqual(f({ busca: 'LINKEDIN', situacao: 'todas' }), ['José Antônio']);
  assert.deepEqual(f({ busca: '98888', situacao: 'todas' }), ['Maria']);
  assert.deepEqual(f({ busca: 'jose maria', situacao: 'todas' }), []);
  assert.deepEqual(f({ busca: '', situacao: 'em_processo' }), ['Maria']);
  assert.deepEqual(f({ busca: '', situacao: 'reprovada' }), ['Pedro']);
  assert.deepEqual(f({ busca: '', situacao: 'cadastrada' }), ['José Antônio']);
  assert.equal(f({}).length, 3);
});

test('vagas para onde dá pra levar: só aprovadas e abertas (não pendentes nem encerradas)', () => {
  const c = ctx();
  const r = [
    { id: 'a', status: 'aprovada' },
    { id: 'b', status: 'pendente' },
    { id: 'c', status: 'aprovada', encerrada: true },
    { id: 'd', status: 'reprovada' },
  ];
  assert.deepEqual(plano(rodar(c, `vagasParaLevarRS(${J(r)}).map((x) => x.id)`)), ['a']);
});

test('dá pra levar? sim para cadastrada e reprovada; não para quem está em processo, foi contratada ou já esteve na mesma vaga', () => {
  const c = ctx();
  const pode = (situacao, processos, vagaId) =>
    plano(rodar(c, `podeLevarPessoaRS(${J({ situacao, processos })}, ${J(vagaId)})`));
  assert.equal(pode('cadastrada', [], 'v1').ok, true);
  assert.equal(pode('reprovada', [{ vagaId: 'v1' }], 'v2').ok, true);
  assert.equal(pode('em_processo', [{ vagaId: 'v1' }], 'v2').ok, false);
  assert.match(pode('em_processo', [{ vagaId: 'v1' }], 'v2').motivo, /já está em um processo/);
  assert.equal(pode('contratada', [{ vagaId: 'v1' }], 'v2').ok, false);
  assert.equal(pode('reprovada', [{ vagaId: 'v1' }], 'v1').ok, false);
  assert.match(pode('reprovada', [{ vagaId: 'v1' }], 'v1').motivo, /Reabrir/);
});

test('banco de talentos: a pessoa "está lá" se o e-mail bate (sem diferenciar maiúsculas); sem e-mail nunca', () => {
  const c = ctx();
  const no = (email, talentos) => rodar(c, `pessoaNoBancoRS({ principal: { email: ${J(email)} } }, ${J(talentos)})`);
  assert.equal(no('ana@x.com', [{ email: 'ANA@x.com' }]), true);
  assert.equal(no('ana@x.com', [{ email: 'bia@x.com' }]), false);
  assert.equal(no('', [{ email: '' }]), false);
  assert.equal(no('ana@x.com', null), false);
});

test('descrição do processo: vaga com cargo e a etapa; reprovada, contratada e vaga removida', () => {
  const c = ctx();
  const d = (reg) =>
    plano(
      rodar(
        c,
        `descricaoDoProcessoRS(${J(reg)}, [{ id: 'v1', codigo: 'REQ-001', cargoId: 'cg' }], [{ id: 'cg', nome: 'Vendedor' }])`
      )
    );
  assert.equal(d({ vagaId: 'v1', etapa: 'video' }).texto, 'Vaga REQ-001 (Vendedor) — Vídeo de apresentação');
  assert.equal(
    d({ vagaId: 'v1', etapa: 'video', reprovado: true }).texto,
    'Vaga REQ-001 (Vendedor) — Reprovado(a) / desistiu'
  );
  assert.equal(
    d({ vagaId: 'v1', etapa: 'aprovado', convertidoEm: 'x' }).texto,
    'Vaga REQ-001 (Vendedor) — Contratado(a)'
  );
  assert.equal(d({ vagaId: 'sumiu', etapa: 'video' }).texto, 'Vaga vaga removida — Vídeo de apresentação');
});

// ======================= cadastrar =======================
test('cadastrar pessoa: exige nome, valida o e-mail, cria SEM vaga e SEM etapa, e não manda e-mail a ninguém', async () => {
  const c = ctx();
  cenario(c, []);
  campos(c, { rs_pes_nome: '', rs_pes_email: '' });
  rodar(c, 'criarPessoaRS()');
  assert.ok(c.__toasts.some((t) => t.includes('Informe o nome')));
  campos(c, { rs_pes_nome: 'Ana', rs_pes_email: 'isto-nao-e-email' });
  rodar(c, 'criarPessoaRS()');
  assert.ok(c.__toasts.some((t) => t.includes('e-mail parece inválido')));
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0);
  campos(c, {
    rs_pes_nome: '  Ana Souza ',
    rs_pes_email: 'ana@x.com',
    rs_pes_telefone: '11 99999',
    rs_pes_origem: '',
    rs_pes_curriculo: 'Experiência em vendas',
  });
  rodar(c, 'criarPessoaRS()');
  const p = plano(rodar(c, 'state.rs.candidatos[0]'));
  assert.equal(p.nome, 'Ana Souza');
  assert.equal(p.vagaId, null);
  assert.equal(p.etapa, null);
  assert.equal(p.origem, 'Cadastro manual');
  assert.equal(p.reprovado, false);
  assert.match(p.historico[0].observacao, /cadastrada no Recrutamento/);
  await esperar();
  assert.equal(c.__invocacoes.length, 0, 'cadastrar não manda e-mail: a pessoa ainda não está em nenhuma vaga');
});

test('cadastrar: contato repetido em QUALQUER lugar do cadastro pergunta antes; recusar não cria', () => {
  const c = ctx();
  cenario(c, [P({ id: 'a', nome: 'Ana Souza', email: 'ana@x.com', vagaId: 'v1', etapa: 'triagem' })]);
  campos(c, { rs_pes_nome: 'Ana de novo', rs_pes_email: 'ANA@x.com' });
  const perguntas = [];
  c.confirm = (m) => (perguntas.push(m), false);
  rodar(c, 'criarPessoaRS()');
  assert.equal(perguntas.length, 1);
  assert.match(perguntas[0], /Já existe uma pessoa com esse contato.*Ana Souza/);
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 1);
  c.confirm = () => true;
  rodar(c, 'criarPessoaRS()');
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 2);
});

// ======================= editar e excluir =======================
test('editar: os dados de contato mudam em TODOS os registros da pessoa; e-mail inválido e nome vazio são recusados', () => {
  const c = ctx();
  cenario(c, [
    P({ id: 'a', nome: 'Ana', email: 'ana@x.com', vagaId: 'v1', etapa: 'triagem', criadoEm: '2026-10-05T12:00:00Z' }),
    P({ id: 'b', nome: 'Ana', email: 'ana@x.com', vagaId: 'v2', reprovado: true, criadoEm: '2026-09-01T12:00:00Z' }),
  ]);
  campos(c, { rs_ed_nome: '', rs_ed_email: 'ana@x.com' });
  rodar(c, "salvarPessoaRS('a')");
  assert.ok(c.__toasts.some((t) => t.includes('Informe o nome')));
  campos(c, { rs_ed_nome: 'Ana', rs_ed_email: 'xxx' });
  rodar(c, "salvarPessoaRS('a')");
  assert.ok(c.__toasts.some((t) => t.includes('e-mail parece inválido')));
  campos(c, {
    rs_ed_nome: 'Ana Paula Souza',
    rs_ed_email: 'ana@x.com',
    rs_ed_telefone: '11 97777',
    rs_ed_origem: 'Indicação',
    rs_ed_curriculo: 'Novo resumo',
  });
  rodar(c, "salvarPessoaRS('a')");
  for (const i of [0, 1]) {
    assert.equal(rodar(c, `state.rs.candidatos[${i}].nome`), 'Ana Paula Souza');
    assert.equal(rodar(c, `state.rs.candidatos[${i}].telefone`), '11 97777');
    assert.equal(rodar(c, `state.rs.candidatos[${i}].curriculo`), 'Novo resumo');
  }
  assert.equal(rodar(c, 'state.rs.candidatos[0].vagaId'), 'v1', 'o processo de cada registro não muda');
  assert.equal(rodar(c, 'state.rs.candidatos[1].reprovado'), true);
});

test('excluir: apaga a pessoa inteira (todos os registros), pede confirmação, avisa se está em processo e audita só o ID', () => {
  const c = ctx();
  cenario(c, [
    P({ id: 'a', nome: 'Ana', email: 'ana@x.com', vagaId: 'v1', etapa: 'triagem', criadoEm: '2026-10-05T12:00:00Z' }),
    P({ id: 'b', nome: 'Ana', email: 'ana@x.com', vagaId: 'v2', reprovado: true }),
    P({ id: 'c', nome: 'Bruno', email: 'b@x.com' }),
  ]);
  const msgs = [];
  c.confirm = (m) => (msgs.push(m), false);
  rodar(c, "removerPessoaRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 3, 'recusou: nada muda');
  assert.match(msgs[0], /ATENÇÃO: ela está em um processo seletivo/);
  c.confirm = () => true;
  rodar(c, "removerPessoaRS('a')");
  assert.deepEqual(
    plano(rodar(c, 'state.rs.candidatos.map((x) => x.id)')),
    ['c'],
    'os dois registros da Ana saíram; o Bruno ficou'
  );
  assert.deepEqual(plano(c.__auditoria), [['rs.pessoa_excluida', { pessoaId: 'a' }]]);
  assert.ok(!JSON.stringify(c.__auditoria).includes('Ana'));
});

test('excluir: com vídeo enviado a exclusão é BLOQUEADA (o vídeo é apagado antes, no processo)', () => {
  const c = ctx();
  cenario(c, [P({ id: 'a', nome: 'Ana', email: 'ana@x.com', vagaId: 'v1', etapa: 'video' })]);
  rodar(c, "_rsVideos = [{ id: 'vid1', candidato_ref: 'a', status: 'enviado' }];");
  rodar(c, "removerPessoaRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 1);
  assert.ok(c.__toasts.some((t) => t.includes('Exclua o vídeo antes')));
  rodar(c, "_rsVideos = [{ id: 'vid1', candidato_ref: 'a', status: 'cancelado' }];");
  rodar(c, "removerPessoaRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0, 'pedido cancelado não segura a exclusão');
});

// ======================= levar para o processo seletivo =======================
test('levar quem era SÓ CADASTRADA: o mesmo registro entra na vaga na etapa "Nova candidatura", com histórico, e recebe o e-mail da etapa', async () => {
  const c = ctx();
  cenario(c, [
    P({
      id: 'a',
      nome: 'Ana',
      email: 'ana@x.com',
      historico: [{ de: null, para: null, observacao: 'Pessoa cadastrada no Recrutamento' }],
    }),
  ]);
  campos(c, { rs_levar_a: 'v1' });
  rodar(c, "levarPessoaParaVagaRS('a')");
  const r = plano(rodar(c, 'state.rs.candidatos'));
  assert.equal(r.length, 1, 'não duplica a pessoa');
  assert.equal(r[0].vagaId, 'v1');
  assert.equal(r[0].etapa, 'nova');
  assert.equal(r[0].reprovado, false);
  assert.equal(r[0].historico.length, 2);
  assert.match(r[0].historico[1].observacao, /Levada do Recrutamento para a vaga REQ-001/);
  assert.ok(c.__toasts.some((t) => t.includes('foi levada para a vaga REQ-001')));
  await esperar();
  assert.equal(c.__invocacoes.filter((x) => x.nome === 'enviar-email').length, 1);
});

test('levar quem JÁ PASSOU por outro processo: cria um registro NOVO na vaga e preserva o histórico do processo anterior', () => {
  const c = ctx();
  cenario(c, [
    P({
      id: 'a',
      nome: 'Ana',
      email: 'ana@x.com',
      telefone: '11 9',
      origem: 'LinkedIn',
      curriculo: 'resumo',
      perfil: { idade: 30 },
      vagaId: 'v1',
      etapa: 'triagem',
      reprovado: true,
      historico: [{ para: 'triagem' }],
    }),
  ]);
  campos(c, { rs_levar_a: 'v2' });
  rodar(c, "levarPessoaParaVagaRS('a')");
  const r = plano(rodar(c, 'state.rs.candidatos'));
  assert.equal(r.length, 2);
  assert.equal(r[0].vagaId, 'v1');
  assert.equal(r[0].reprovado, true, 'o processo anterior continua como estava');
  assert.equal(r[0].historico.length, 1);
  assert.equal(r[1].vagaId, 'v2');
  assert.equal(r[1].etapa, 'nova');
  assert.equal(r[1].email, 'ana@x.com');
  assert.equal(r[1].origem, 'LinkedIn');
  assert.deepEqual(r[1].perfil, { idade: 30 });
  assert.notEqual(r[1].id, 'a');
});

test('levar: bloqueia quem está em processo, quem foi contratada, quem já esteve na vaga, vaga indisponível e escolha vazia', () => {
  const casos = [
    {
      regs: [P({ id: 'a', email: 'a@x.com', vagaId: 'v1', etapa: 'video' })],
      vaga: 'v2',
      trecho: /já está em um processo/,
    },
    {
      regs: [P({ id: 'a', email: 'a@x.com', vagaId: 'v1', etapa: 'aprovado', convertidoEm: 'x' })],
      vaga: 'v2',
      trecho: /já foi contratada/,
    },
    {
      regs: [P({ id: 'a', email: 'a@x.com', vagaId: 'v1', reprovado: true })],
      vaga: 'v1',
      trecho: /já esteve nesta vaga/,
    },
    { regs: [P({ id: 'a', email: 'a@x.com' })], vaga: 'v3', trecho: /não está disponível/ }, // pendente
    { regs: [P({ id: 'a', email: 'a@x.com' })], vaga: 'v4', trecho: /não está disponível/ }, // encerrada
    { regs: [P({ id: 'a', email: 'a@x.com' })], vaga: 'inexistente', trecho: /não está disponível/ },
    { regs: [P({ id: 'a', email: 'a@x.com' })], vaga: '', trecho: /Escolha a vaga/ },
  ];
  for (const k of casos) {
    const c = ctx();
    cenario(c, k.regs);
    const antes = J(rodar(c, 'state.rs.candidatos'));
    campos(c, { rs_levar_a: k.vaga });
    rodar(c, "levarPessoaParaVagaRS('a')");
    assert.ok(
      c.__toasts.some((t) => k.trecho.test(t)),
      `esperava ${k.trecho} para vaga "${k.vaga}"; veio ${J(c.__toasts)}`
    );
    assert.equal(J(rodar(c, 'state.rs.candidatos')), antes, 'nada pode mudar');
  }
});

test('ver no processo: abre o Processo seletivo já com o funil da vaga aberto', () => {
  const c = ctx();
  rodar(c, "irParaProcessoDaVagaRS('v2')");
  assert.equal(rodar(c, '_rsRequisicaoExpandida'), 'v2');
  assert.deepEqual(plano(c.__gotos), ['rs_processo']);
});

// ======================= a tela =======================
test('acesso ao cadastro: só Administrador e RH (são dados pessoais)', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, [P({ id: 'a', nome: 'Ana' })]);
    const html = rodar(c, 'pageRS()');
    assert.ok(html.includes('Só o Administrador e o RH') && !html.includes('Ana'), String(papel));
  }
  for (const papel of ['owner', 'rh']) {
    const c = ctx(papel);
    cenario(c, [P({ id: 'a', nome: 'Ana' })]);
    assert.ok(rodar(c, 'pageRS()').includes('R&S — Recrutamento'), papel);
  }
});

test('a tela lista cada pessoa UMA vez, com todos os processos, o banco de talentos e as ações certas para cada situação', () => {
  const c = ctx();
  cenario(c, [
    P({
      id: 'a',
      nome: 'Ana Souza',
      email: 'ana@x.com',
      vagaId: 'v1',
      etapa: 'video',
      criadoEm: '2026-10-05T12:00:00Z',
    }),
    P({
      id: 'b',
      nome: 'Ana Souza',
      email: 'ana@x.com',
      vagaId: 'v2',
      reprovado: true,
      criadoEm: '2026-09-01T12:00:00Z',
    }),
    P({ id: 'c', nome: 'Bruno Lima', email: 'bruno@x.com' }),
    P({ id: 'd', nome: 'Carla', email: 'carla@x.com', vagaId: 'v1', etapa: 'aprovado', convertidoEm: 'x' }),
  ]);
  c._talentos = [{ email: 'BRUNO@x.com' }];
  c._talentosCarregados = true;
  c._talentosCarregando = false;
  const html = rodar(c, 'pageRS()');
  assert.equal((html.match(/<b>Ana Souza<\/b>/g) || []).length, 1, 'a Ana aparece uma vez só');
  assert.ok(
    html.includes('Vaga REQ-001 (Vendedor) — Vídeo de apresentação') &&
      html.includes('Vaga REQ-002 (Analista) — Reprovado(a) / desistiu')
  );
  assert.ok(html.includes('Só cadastrada'));
  assert.equal(
    (html.match(/pill-alavancar" title="Autorizou ficar no banco de talentos">No banco/g) || []).length,
    1,
    'só o Bruno está no banco'
  );
  const linhaDe = (nome) => new RegExp(`<b>${nome}</b>[\\s\\S]*?</tr>`).exec(html)[0];
  assert.ok(linhaDe('Bruno Lima').includes('Levar para a vaga…') && !linhaDe('Bruno Lima').includes('Ver no processo'));
  assert.ok(
    linhaDe('Ana Souza').includes('Ver no processo') && !linhaDe('Ana Souza').includes('Levar para a vaga…'),
    'em processo: não dá pra levar'
  );
  assert.ok(!linhaDe('Carla').includes('Levar para a vaga…'), 'contratada: não dá pra levar');
  const opcoes = [...linhaDe('Bruno Lima').matchAll(/<option value="(\w+)">/g)].map((m) => m[1]);
  assert.deepEqual(opcoes, ['v1', 'v2'], 'só as vagas aprovadas e abertas');
  assert.ok(html.includes('(3)'), 'contagem de pessoas (4 registros, 3 pessoas)');
});

test('a tela filtra, mostra "n de m" e avisa quando não há vaga aprovada para levar ninguém', () => {
  const c = ctx();
  cenario(c, [P({ id: 'a', nome: 'Ana' }), P({ id: 'b', nome: 'Bruno' })], { requisicoes: [] });
  rodar(c, "_rsCadastroFiltro = { busca: 'bru', situacao: 'todas' };");
  const html = rodar(c, 'pageRS()');
  assert.ok(html.includes('(1 de 2)') && html.includes('Bruno') && !html.includes('<b>Ana</b>'));
  assert.ok(html.includes('primeiro crie e aprove uma vaga'));
  assert.ok(!html.includes('Levar para a vaga…'), 'sem vaga disponível não há como levar');
  rodar(c, "filtrarCadastroRS('situacao', 'reprovada');");
  assert.equal(rodar(c, '_rsCadastroFiltro.situacao'), 'reprovada');
  assert.equal(rodar(c, '_rsCadastroFiltro.busca'), 'bru', 'mudar a situação não apaga a busca');
  assert.ok(rodar(c, 'pageRS()').includes('Nenhuma pessoa com esse filtro.'));
});

test('a tela carrega o banco de talentos UMA vez; cadastro vazio mostra a orientação', () => {
  const c = ctx();
  cenario(c, []);
  let carregou = 0;
  c._talentosCarregados = false;
  c._talentosCarregando = false;
  c._talentos = [];
  c.carregarTalentos = () => carregou++;
  const html = rodar(c, 'pageRS()');
  assert.equal(carregou, 1);
  assert.ok(html.includes('Nenhuma pessoa cadastrada ainda'));
  c._talentosCarregados = true;
  rodar(c, 'pageRS()');
  assert.equal(carregou, 1, 'depois de carregado não pede de novo');
});

test('nome, e-mail, origem e currículo com HTML saem como texto, na lista, nos dados abertos e na edição (sem injeção)', () => {
  const c = ctx();
  cenario(c, [
    P({
      id: 'a',
      nome: 'Ana <img src=x onerror=alert(1)>',
      email: 'a@x.com',
      origem: '<script>x</script>',
      curriculo: '</textarea><script>alert(2)</script>',
    }),
  ]);
  rodar(c, "_rsPessoaDadosAbertos = 'a'; _rsPessoaEditando = 'a';");
  const html = rodar(c, 'pageRS()');
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;') || html.includes('&lt;img'));
});

test('integração: o Recrutamento só chama o e-mail da etapa ao levar a pessoa para uma vaga; não tem funil nem vaga; avisa onde trabalhar o processo', () => {
  const js = ler('js/47-rs-cadastro.js');
  assert.equal((js.match(/enviarEmailEtapaRS\(/g) || []).length, 1);
  assert.ok(js.indexOf('enviarEmailEtapaRS(') > js.indexOf('function levarPessoaParaVagaRS'));
  for (const f of ['renderPipelineCandidatosRS', 'moverEtapaCandidatoRS', 'rsRequisicoesCardHtml', 'criarRequisicaoRS'])
    assert.ok(!js.includes(f), `o Recrutamento não pode mexer em ${f}`);
  assert.ok(/Processo seletivo/.test(js));
});
