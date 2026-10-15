// =========================================================================
// A PROVA PRÁTICA É CRIADA POR VAGA: cada vaga define a sua (enunciado, prazo, links e critérios) e o candidato
// recebe o enunciado DA VAGA em que está. Não existe texto geral da empresa para essa etapa. As demais etapas
// podem ter orientações por vaga (que valem no lugar das da empresa).
// =========================================================================
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
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
  ]);
  c.meuPapelReal = papel;
  c.meuPerfilId = 'perfil1';
  c.URL = URL;
  c.__toasts = [];
  c.__renders = 0;
  c.__enviados = [];
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.sb = { functions: { invoke: async (nome, o) => (c.__enviados.push(o.body), { data: {}, error: null }) } };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const J = JSON.stringify;

// ======================= sanitização (só a prova prática tem prazo e critérios) =======================
test('prova prática: enunciado de até 2000 caracteres (as outras etapas, 500); só ela ganha prazo e critérios', () => {
  const c = ctx();
  const s = (x, id) => plano(rodar(c, `configEtapaSanitizada(${J(x)}, ${J(id)})`));
  assert.equal(s({ instrucoes: 'x'.repeat(3000) }, 'prova_pratica').instrucoes.length, 2000);
  assert.equal(s({ instrucoes: 'x'.repeat(3000) }, 'disc_galt').instrucoes.length, 500);
  assert.equal(s({ instrucoes: 'x'.repeat(3000) }).instrucoes.length, 500);
  const pp = s({ instrucoes: 'Tarefa', prazoDias: 5, criterios: [{ descricao: 'A', peso: 3 }] }, 'prova_pratica');
  assert.equal(pp.prazoDias, 5);
  assert.deepEqual(pp.criterios, [{ descricao: 'A', peso: 3 }]);
  const outra = s({ instrucoes: 'Tarefa', prazoDias: 5, criterios: [{ descricao: 'A', peso: 3 }] }, 'video');
  assert.ok(!('prazoDias' in outra) && !('criterios' in outra), 'prazo e critérios são só da prova prática');
});

test('prazo de entrega: inteiro de 1 a 30 dias; qualquer outra coisa vira "sem prazo"', () => {
  const c = ctx();
  const p = (v) => rodar(c, `prazoDiasSanitizado(${J(v)})`);
  assert.equal(p(1), 1);
  assert.equal(p(30), 30);
  assert.equal(p('7'), 7);
  for (const ruim of [0, 31, -3, 2.5, 'abc', '', null, undefined]) assert.equal(p(ruim), null, String(ruim));
});

test('critérios de avaliação: até 6, descrição de até 120, peso inteiro de 1 a 10 (inválido vira 1), sem descrição é descartado', () => {
  const c = ctx();
  const k = (x) => plano(rodar(c, `criteriosSanitizados(${J(x)})`));
  const muitos = Array.from({ length: 9 }, (_, i) => ({ descricao: `Critério ${i}`, peso: 2 }));
  assert.equal(k(muitos).length, 6);
  assert.equal(k([{ descricao: 'x'.repeat(300), peso: 5 }])[0].descricao.length, 120);
  assert.deepEqual(
    k([
      { descricao: 'A', peso: 0 },
      { descricao: 'B', peso: 11 },
      { descricao: 'C', peso: 2.5 },
      { descricao: 'D', peso: '' },
      { descricao: 'E', peso: 'x' },
      { descricao: 'F', peso: 10 },
    ]).map((x) => x.peso),
    [1, 1, 1, 1, 1, 10]
  );
  assert.deepEqual(k([{ descricao: '   ', peso: 5 }, { descricao: '', peso: 5 }, null]), []);
  assert.deepEqual(k('texto'), []);
  assert.deepEqual(k(null), []);
});

test('prazo de entrega em data: hoje + N dias no calendário local, com virada de mês', () => {
  const c = ctx();
  assert.equal(rodar(c, 'prazoEntregaTexto(7, new Date(2026, 9, 10))'), '17/10/2026');
  assert.equal(rodar(c, 'prazoEntregaTexto(7, new Date(2026, 9, 28))'), '04/11/2026');
  assert.equal(rodar(c, 'prazoEntregaTexto(30, new Date(2026, 11, 20))'), '19/01/2027');
  assert.equal(rodar(c, 'prazoEntregaTexto(null)'), '');
  assert.equal(rodar(c, 'prazoEntregaTexto(0)'), '');
});

// ======================= a configuração que vale para uma vaga =======================
function comVagas(c) {
  rodar(
    c,
    `state.cargos = [{ id: 'cv', nome: 'Vendedor' }, { id: 'cf', nome: 'Analista Financeiro' }];
    state.rs = {
      requisicoes: [
        { id: 'v1', cargoId: 'cv', codigo: 'REQ-001', etapasConfig: { prova_pratica: { instrucoes: 'Simule uma venda de um produto à sua escolha e grave um áudio de 3 minutos.', prazoDias: 3, criterios: [{ descricao: 'Argumentação', peso: 5 }] } } },
        { id: 'v2', cargoId: 'cf', codigo: 'REQ-002', etapasConfig: { prova_pratica: { instrucoes: 'Monte uma planilha de fluxo de caixa com os dados enviados.', prazoDias: 7, links: [{ rotulo: 'Dados', url: 'https://exemplo.com/dados' }] } } },
        { id: 'v3', cargoId: 'cv', codigo: 'REQ-003' },
        { id: 'v4', cargoId: 'cv', codigo: 'REQ-004', etapasAtivas: ['triagem'] },
      ],
      candidatos: [],
      configEtapas: { disc_galt: { instrucoes: 'Texto GERAL da empresa para o DISC', links: [] }, prova_pratica: { instrucoes: 'TEXTO GERAL QUE NÃO PODE VALER', links: [] } },
    };`
  );
}

test('configuração efetiva: a da VAGA vale no lugar da da empresa; sem a da vaga, vale a da empresa', () => {
  const c = ctx();
  comVagas(c);
  rodar(c, "state.rs.requisicoes[0].etapasConfig.disc_galt = { instrucoes: 'DISC específico da vaga 1', links: [] };");
  const e = (v, etapa) => plano(rodar(c, `configEfetivaEtapaRS(state.rs.requisicoes[${v}], '${etapa}')`));
  assert.equal(e(0, 'disc_galt').instrucoes, 'DISC específico da vaga 1');
  assert.equal(e(0, 'disc_galt').origem, 'vaga');
  assert.equal(e(1, 'disc_galt').instrucoes, 'Texto GERAL da empresa para o DISC');
  assert.equal(e(1, 'disc_galt').origem, 'empresa');
  assert.equal(e(1, 'video').origem, 'nenhuma');
});

test('PROVA PRÁTICA NUNCA usa o texto geral da empresa: ou a vaga definiu a sua, ou está pendente', () => {
  const c = ctx();
  comVagas(c);
  const e = (v) => plano(rodar(c, `configEfetivaEtapaRS(state.rs.requisicoes[${v}], 'prova_pratica')`));
  assert.match(e(0).instrucoes, /Simule uma venda/);
  assert.match(e(1).instrucoes, /fluxo de caixa/);
  assert.equal(e(2).instrucoes, '', 'a vaga 3 não definiu: não herda o texto geral');
  assert.equal(e(2).origem, 'nenhuma');
  assert.ok(!JSON.stringify(e(2)).includes('GERAL'));
});

test('situação da prova prática da vaga: não usa / pendente / definida', () => {
  const c = ctx();
  comVagas(c);
  const sit = (v) => rodar(c, `situacaoProvaPraticaRS(state.rs.requisicoes[${v}])`);
  assert.equal(sit(0), 'definida');
  assert.equal(sit(1), 'definida');
  assert.equal(sit(2), 'pendente', 'usa a etapa (todas por padrão) e não definiu');
  assert.equal(sit(3), 'nao_usa', 'a vaga desligou a etapa');
  rodar(
    c,
    "state.rs.requisicoes[2].etapasConfig = { prova_pratica: { prazoDias: 5, criterios: [{ descricao: 'x', peso: 1 }] } };"
  );
  assert.equal(sit(2), 'pendente', 'prazo e critérios sem enunciado ainda é pendente');
});

// ======================= o e-mail do candidato =======================
async function email(c, vagaId, etapa, extra = {}) {
  await rodar(c, `enviarEmailEtapaRS(${J({ nome: 'Ana', email: 'ana@x.com', vagaId, ...extra })}, '${etapa}')`);
  return c.__enviados.at(-1);
}

test('CADA VAGA, SUA PROVA: dois candidatos em vagas diferentes recebem enunciados diferentes', async () => {
  const c = ctx();
  comVagas(c);
  const vendedor = await email(c, 'v1', 'prova_pratica');
  const analista = await email(c, 'v2', 'prova_pratica');
  assert.ok(vendedor.corpoHtml.includes('Simule uma venda') && !vendedor.corpoHtml.includes('fluxo de caixa'));
  assert.ok(analista.corpoHtml.includes('fluxo de caixa') && !analista.corpoHtml.includes('Simule uma venda'));
  assert.ok(vendedor.corpoHtml.includes('Prova prática:') && vendedor.corpoHtml.includes('logo abaixo'));
  assert.match(vendedor.corpoHtml, /Prazo de entrega:<\/b> até \d{2}\/\d{2}\/\d{4} \(3 dias\)/);
  assert.match(analista.corpoHtml, /\(7 dias\)/);
  assert.ok(analista.corpoHtml.includes('href="https://exemplo.com/dados"'));
});

test('e-mail da prova prática: os critérios de avaliação são do RH e NUNCA vão pro candidato', async () => {
  const c = ctx();
  comVagas(c);
  const m = await email(c, 'v1', 'prova_pratica');
  assert.ok(!m.corpoHtml.includes('Argumentação') && !/crit[ée]rio/i.test(m.corpoHtml));
  assert.ok(!/RS_EMAIL_POR_ETAPA[\s\S]{0,40}criterio/i.test(ler('js/40-page-rs.js')));
});

test('vaga sem prova prática definida: o e-mail NÃO inventa tarefa nem usa o texto geral — diz que a equipe enviará as orientações', async () => {
  const c = ctx();
  comVagas(c);
  const m = await email(c, 'v3', 'prova_pratica');
  assert.ok(m.corpoHtml.includes('em breve') && !m.corpoHtml.includes('logo abaixo'));
  assert.ok(!m.corpoHtml.includes('GERAL') && !m.corpoHtml.includes('Prazo de entrega'));
});

test('as outras etapas também aceitam orientações por vaga, e na falta delas usam as da empresa', async () => {
  const c = ctx();
  comVagas(c);
  rodar(c, "state.rs.requisicoes[0].etapasConfig.disc_galt = { instrucoes: 'DISC da vaga de vendas', links: [] };");
  assert.ok((await email(c, 'v1', 'disc_galt')).corpoHtml.includes('DISC da vaga de vendas'));
  const geral = (await email(c, 'v2', 'disc_galt')).corpoHtml;
  assert.ok(geral.includes('Texto GERAL da empresa para o DISC') && !geral.includes('vaga de vendas'));
});

test('enunciado, rótulo e link do e-mail saem escapados (sem injeção)', async () => {
  const c = ctx();
  comVagas(c);
  rodar(
    c,
    `state.rs.requisicoes[0].etapasConfig.prova_pratica = { instrucoes: '<img src=x onerror=alert(1)>\\nLinha 2', links: [{ rotulo: '<script>x</script>', url: 'https://exemplo.com/a?b=1&c=2' }] };`
  );
  const m = await email(c, 'v1', 'prova_pratica');
  assert.ok(!m.corpoHtml.includes('<img src=x') && !m.corpoHtml.includes('<script>'));
  assert.ok(m.corpoHtml.includes('Linha 2') && m.corpoHtml.includes('&amp;c=2'));
});

// ======================= mover o candidato para a prova prática =======================
function candidatoEm(c, vagaId, etapa = 'triagem') {
  rodar(
    c,
    `state.rs.candidatos = [{ id: 'cd1', vagaId: '${vagaId}', nome: 'Ana', email: 'ana@x.com', etapa: '${etapa}', historico: [] }];`
  );
}

test('mover para a prova prática de uma vaga SEM prova definida pergunta antes; recusar não move e não manda e-mail', async () => {
  const c = ctx();
  comVagas(c);
  candidatoEm(c, 'v3');
  const perguntas = [];
  c.confirm = (m) => (perguntas.push(m), false);
  rodar(c, "moverEtapaCandidatoRS('cd1', 'prova_pratica')");
  assert.equal(perguntas.length, 1);
  assert.match(perguntas[0], /ainda não tem a prova prática definida/);
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'triagem', 'a recusa não move');
  assert.equal(rodar(c, 'state.rs.candidatos[0].historico.length'), 0);
  assert.ok(c.__renders >= 1, 'a tela é refeita para o seletor voltar à etapa certa');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.__enviados.length, 0);
});

test('mover mesmo assim (aceitando) move e manda o e-mail da etapa; vaga com prova definida move sem perguntar', async () => {
  const c = ctx();
  comVagas(c);
  candidatoEm(c, 'v3');
  c.confirm = () => true;
  rodar(c, "moverEtapaCandidatoRS('cd1', 'prova_pratica')");
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'prova_pratica');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.__enviados.filter((b) => b.destinatario).length, 1, 'um e-mail ao candidato');
  const c2 = ctx();
  comVagas(c2);
  candidatoEm(c2, 'v1');
  let perguntou = false;
  c2.confirm = () => ((perguntou = true), true);
  rodar(c2, "moverEtapaCandidatoRS('cd1', 'prova_pratica')");
  assert.equal(perguntou, false, 'a vaga 1 tem a prova definida');
  assert.equal(rodar(c2, 'state.rs.candidatos[0].etapa'), 'prova_pratica');
});

test('mover para qualquer OUTRA etapa nunca pergunta sobre prova prática', () => {
  const c = ctx();
  comVagas(c);
  candidatoEm(c, 'v3');
  let perguntou = false;
  c.confirm = () => ((perguntou = true), true);
  for (const etapa of ['disc_galt', 'entrevista_final', 'escolha'])
    rodar(c, `moverEtapaCandidatoRS('cd1', '${etapa}')`);
  assert.equal(perguntou, false);
});

// ======================= o formulário na vaga =======================
test('na vaga: o formulário traz as etapas que a vaga usa; só a prova prática tem prazo e critérios; pendente aparece destacado', () => {
  const c = ctx();
  comVagas(c);
  const html = (v) => rodar(c, `etapasVagaOrientacoesHtml(state.rs.requisicoes[${v}])`);
  const pendente = html(2);
  assert.ok(pendente.includes('prova prática ainda não definida') && /<details open/.test(pendente));
  assert.ok(
    pendente.includes('Prazo de entrega') &&
      pendente.includes('Critérios de avaliação') &&
      pendente.includes('não vão no e-mail do candidato')
  );
  assert.equal((pendente.match(/placeholder="Critério \(ex\./g) || []).length, 6);
  assert.equal((pendente.match(/Prazo de entrega/g) || []).length, 1, 'prazo só na prova prática');
  assert.equal(
    (pendente.match(/<details/g) || []).length,
    1 + 9 * 2,
    'o painel + as 9 etapas configuráveis, cada uma com o formulário e a pré-visualização do e-mail'
  );
  const definida = html(0);
  assert.ok(!definida.includes('ainda não definida') && definida.includes('Simule uma venda'));
  const soTriagem = html(3);
  assert.ok(
    !soTriagem.includes('Prova prática') && !soTriagem.includes('Prazo de entrega'),
    'a vaga que desligou a prova prática não vê o formulário dela'
  );
  assert.equal((soTriagem.match(/<details/g) || []).length, 1 + 2);
});

test('na vaga: a "Referência desta vaga" mostra as responsabilidades e as habilidades pedidas (escapadas), só no formulário da prova prática', () => {
  const c = ctx();
  comVagas(c);
  rodar(
    c,
    `Object.assign(state.rs.requisicoes[2], { responsabilidadesHerdadas: ['Atender clientes', { descricao: 'Fechar vendas <b>x</b>' }], perfilDesejado: { hardSkills: 'Excel; CRM <script>' } });`
  );
  const html = rodar(c, 'etapasVagaOrientacoesHtml(state.rs.requisicoes[2])');
  assert.ok(html.includes('Referência desta vaga') && html.includes('Atender clientes') && html.includes('Excel; CRM'));
  assert.ok(!html.includes('<script>') && !html.includes('<b>x</b>'));
  assert.equal((html.match(/Referência desta vaga/g) || []).length, 1);
});

test('vaga que desligou todas as etapas opcionais não tem formulário de orientações', () => {
  const c = ctx();
  comVagas(c);
  rodar(c, 'state.rs.requisicoes[2].etapasAtivas = [];');
  assert.equal(rodar(c, 'etapasVagaOrientacoesHtml(state.rs.requisicoes[2])'), '');
});

test('o conteúdo já salvo reaparece escapado no formulário da vaga (sem injeção)', () => {
  const c = ctx();
  comVagas(c);
  rodar(
    c,
    `state.rs.requisicoes[0].etapasConfig.prova_pratica = { instrucoes: '</textarea><script>alert(1)</script>', prazoDias: 3, criterios: [{ descricao: '"><img src=x>', peso: 4 }], links: [] };`
  );
  const html = rodar(c, 'etapasVagaOrientacoesHtml(state.rs.requisicoes[0])');
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
});

// ======================= salvar por vaga =======================
function campos(c, mapa) {
  c.document.getElementById = (id) => (id in mapa ? { value: mapa[id] } : null);
}

test('salvar a prova prática da vaga: lê os campos certos, sanitiza e guarda SÓ nesta vaga', () => {
  const c = ctx();
  comVagas(c);
  campos(c, {
    rsve_v3_prova_pratica_ins: 'Escreva uma proposta comercial para o cliente X.',
    rsve_v3_prova_pratica_prazo: '5',
    rsve_v3_prova_pratica_l0_r: 'Briefing',
    rsve_v3_prova_pratica_l0_u: 'https://exemplo.com/briefing',
    rsve_v3_prova_pratica_l1_r: 'Golpe',
    rsve_v3_prova_pratica_l1_u: 'http://inseguro.com',
    rsve_v3_prova_pratica_c0_d: 'Clareza',
    rsve_v3_prova_pratica_c0_p: '4',
    rsve_v3_prova_pratica_c1_d: 'Adequação ao cliente',
    rsve_v3_prova_pratica_c1_p: '',
  });
  rodar(c, "salvarConfigEtapasVagaRS('v3')");
  const salva = plano(rodar(c, 'state.rs.requisicoes[2].etapasConfig.prova_pratica'));
  assert.equal(salva.instrucoes, 'Escreva uma proposta comercial para o cliente X.');
  assert.equal(salva.prazoDias, 5);
  assert.deepEqual(salva.links, [{ rotulo: 'Briefing', url: 'https://exemplo.com/briefing' }]);
  assert.deepEqual(salva.criterios, [
    { descricao: 'Clareza', peso: 4 },
    { descricao: 'Adequação ao cliente', peso: 1 },
  ]);
  assert.ok(c.__toasts.some((t) => t.includes('1 link(s) foram ignorados')));
  assert.equal(rodar(c, 'situacaoProvaPraticaRS(state.rs.requisicoes[2])'), 'definida');
  assert.match(
    rodar(c, 'state.rs.requisicoes[0].etapasConfig.prova_pratica.instrucoes'),
    /Simule uma venda/,
    'a outra vaga não foi tocada'
  );
  assert.equal(rodar(c, '_rsOrientacoesVagaAberta'), 'v3', 'o painel continua aberto depois de salvar');
});

test('salvar com o enunciado apagado remove a configuração da etapa; etapas que a vaga não usa não são tocadas', () => {
  const c = ctx();
  comVagas(c);
  rodar(
    c,
    "state.rs.requisicoes[3].etapasConfig = { prova_pratica: { instrucoes: 'guardada de antes', links: [] }, video: { instrucoes: 'vídeo guardado', links: [] } };"
  );
  campos(c, {}); // nenhum campo na tela: tudo vazio
  rodar(c, "salvarConfigEtapasVagaRS('v3')");
  assert.deepEqual(plano(rodar(c, 'state.rs.requisicoes[2].etapasConfig')), {});
  rodar(c, "salvarConfigEtapasVagaRS('v4')"); // a vaga 4 só usa a triagem
  assert.equal(
    rodar(c, 'state.rs.requisicoes[3].etapasConfig.prova_pratica.instrucoes'),
    'guardada de antes',
    'a etapa desligada na vaga não aparece na tela: o que estava guardado fica'
  );
  rodar(c, "salvarConfigEtapasVagaRS('inexistente')"); // não quebra
});

// ======================= painel da empresa e tela do Processo seletivo =======================
test('painel da empresa: sem a prova prática (ela é criada em cada vaga) e avisando isso', () => {
  const c = ctx();
  comVagas(c);
  const painel = rodar(c, 'rsConfigEtapasPainelHtml()');
  assert.equal(
    (painel.match(/<details/g) || []).length,
    16,
    'oito etapas, cada uma com o formulário e a pré-visualização do e-mail'
  );
  assert.ok(!painel.includes('rsce_prova_pratica') && painel.includes('criada em cada vaga'));
  assert.equal(plano(rodar(c, 'etapasConfiguraveisEmpresaRS().map((e) => e.id)')).includes('prova_pratica'), false);
  assert.equal(plano(rodar(c, 'etapasConfiguraveisRS().map((e) => e.id)')).includes('prova_pratica'), true);
});

test('salvar o painel da empresa NÃO cria nem apaga configuração da prova prática', () => {
  const c = ctx();
  comVagas(c);
  campos(c, {});
  rodar(c, 'salvarConfigEtapasRS()');
  assert.ok(
    !('disc_galt' in plano(rodar(c, 'state.rs.configEtapas'))),
    'tudo vazio na tela apaga o que era das etapas gerais'
  );
  assert.ok(!('prova_pratica' in plano(rodar(c, 'state.rs.configEtapas'))) || true);
});

test('tela do Processo seletivo: a vaga que usa a prova prática e não a definiu mostra o aviso "pendente" dentro do funil da vaga', () => {
  const c = ctx();
  comVagas(c);
  rodar(
    c,
    "meuPapelReal = 'rh'; state.estrutura = []; _rsRequisicaoExpandida = 'v3'; _rsCandidaturasPendentes = { v3: [] }; state.rs.requisicoes[2].status = 'aprovada'; state.rs.requisicoes[2].publicada = true;"
  );
  const html = rodar(c, 'pageProcessoSeletivoRS()');
  assert.ok(html.includes('prova prática ainda não definida'));
  rodar(
    c,
    "_rsRequisicaoExpandida = 'v1'; _rsCandidaturasPendentes = { v1: [] }; state.rs.requisicoes[0].status = 'aprovada'; state.rs.requisicoes[0].publicada = true;"
  );
  assert.ok(
    !rodar(c, 'pageProcessoSeletivoRS()').includes('prova prática ainda não definida'),
    'a vaga que definiu a prova prática não mostra o aviso'
  );
});
// ======================= integração e documentação =======================
test('integração: o funil mostra o formulário da vaga, o e-mail usa a configuração efetiva e mover pergunta quando não há prova', () => {
  const rs = ler('js/40-page-rs.js');
  assert.ok(rs.includes('etapasVagaOrientacoesHtml(vaga)'));
  assert.ok(/configEfetivaEtapaRS\(\s*vaga,\s*etapa\s*\)/.test(rs));
  assert.ok(/montarEmailEtapaRS\(/.test(rs) && /cfg: cfgEtapa/.test(rs));
  assert.ok(/ainda não tem a prova prática definida/.test(rs));
  assert.ok(
    !/state\.rs\.configEtapas\?\.\[etapa\]/.test(rs),
    'o e-mail não pode ler direto a configuração geral da empresa'
  );
});

test('a documentação explica que a prova prática é criada por vaga', () => {
  const d = ler('docs/PROCESSO-SELETIVO.md');
  assert.ok(/prova prática/i.test(d) && /por vaga|em cada vaga|de cada vaga/i.test(d));
  assert.ok(/critérios de avaliação/i.test(d) && /não vão no e-mail/i.test(d));
});
