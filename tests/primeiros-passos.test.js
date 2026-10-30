// =========================================================================
// Primeiros passos (um só): calculados do estado real da empresa, o próximo passo em destaque, o recrutamento como passo
// opcional, o cartão some sozinho (ou ao ocultar), e as duas versões antigas do painel foram removidas.
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

function ctx() {
  const c = carregarArquivos(['js/02-core-helpers.js', 'js/52-primeiros-passos.js']);
  Object.assign(c, {
    __renders: 0,
    __salvou: 0,
    render: () => c.__renders++,
    agendarSalvamento: () => c.__salvou++,
    _perfisEmpresa: [],
  });
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const calc = (c, dados) => plano(rodar(c, `calcularPrimeirosPassosRS(${J(dados)})`));
const IDS = ['empresa', 'estrutura', 'cultura', 'cargos', 'usuarios', 'colaboradores', 'ciclos', 'recrutamento'];
const COMPLETO = {
  empresa: { estado: 'Ativa' },
  estrutura: [{ id: 'u' }],
  cultura: { missao: 'Missão' },
  cargos: [{ desenho: { aprovado: true } }],
  perfisEmpresa: [{}, {}],
  colaboradores: [{ inativo: false }],
  ciclos: [{}],
  rs: { requisicoes: [{}] },
};

function estado(c, extra = {}) {
  rodar(
    c,
    `state.empresa = ${J(extra.empresa ?? null)}; state.estrutura = ${J(extra.estrutura ?? [])}; state.cultura = ${J(extra.cultura ?? {})}; state.cargos = ${J(extra.cargos ?? [])}; state.colaboradores = ${J(extra.colaboradores ?? [])}; state.ciclos = ${J(extra.ciclos ?? [])}; state.rs = ${J(extra.rs ?? { requisicoes: [], candidatos: [] })}; state.configuracoes = ${J(extra.configuracoes ?? {})}; _perfisEmpresa = ${J(extra.perfisEmpresa ?? [])};`
  );
}

// ======================= o cálculo =======================
test('os passos, em ordem: 7 obrigatórios e o recrutamento como opcional', () => {
  const c = ctx();
  const r = calc(c, {});
  assert.deepEqual(
    r.passos.map((p) => p.id),
    IDS
  );
  assert.deepEqual(
    r.passos.filter((p) => p.opcional).map((p) => p.id),
    ['recrutamento']
  );
  assert.deepEqual(
    [r.total, r.obrigatorios, r.concluidos, r.concluidosObrigatorios, r.percentual, r.completo],
    [8, 7, 0, 0, 0, false]
  );
  assert.equal(r.proximo.id, 'empresa');
  for (const p of r.passos) assert.ok(p.titulo.length > 10 && p.porque.length > 15 && p.rota, p.id);
});

test('cada passo fica "feito" pelo estado REAL (e só por ele)', () => {
  const c = ctx();
  const feito = (dados) => Object.fromEntries(calc(c, dados).passos.map((p) => [p.id, p.feito]));
  assert.deepEqual(feito({}), Object.fromEntries(IDS.map((i) => [i, false])));
  assert.equal(feito({ empresa: { estado: 'Ativa' } }).empresa, true, 'empresa ativa');
  assert.equal(feito({ empresa: { razaoSocial: 'X', cnpj: '1' } }).empresa, true, 'razão social e CNPJ');
  assert.equal(feito({ empresa: { razaoSocial: 'X' } }).empresa, false);
  assert.equal(feito({ empresa: { estado: 'Rascunho' } }).empresa, false);
  assert.equal(feito({ estrutura: [{}] }).estrutura, true);
  assert.equal(feito({ cultura: { missao: 'x' } }).cultura, true);
  assert.equal(feito({ cultura: { visao: 'x' } }).cultura, false, 'só a missão conta');
  assert.equal(feito({ cargos: [{ desenho: { aprovado: false } }] }).cargos, false);
  assert.equal(feito({ cargos: [{}, { desenho: { aprovado: true } }] }).cargos, true);
  assert.equal(feito({ perfisEmpresa: [{}] }).usuarios, false, 'só o próprio Administrador não conta');
  assert.equal(feito({ perfisEmpresa: [{}, {}] }).usuarios, true);
  assert.equal(feito({ colaboradores: [{ inativo: true }] }).colaboradores, false, 'inativo não conta');
  assert.equal(feito({ colaboradores: [{ inativo: true }, { inativo: false }] }).colaboradores, true);
  assert.equal(feito({ ciclos: [{}] }).ciclos, true);
  assert.equal(feito({ rs: { requisicoes: [{}] } }).recrutamento, true);
  assert.equal(feito({ rs: { requisicoes: [] } }).recrutamento, false);
});

test('o próximo passo é o primeiro OBRIGATÓRIO que falta; o opcional nunca é o próximo; completo ignora o opcional', () => {
  const c = ctx();
  assert.equal(calc(c, { empresa: { estado: 'Ativa' }, estrutura: [{}] }).proximo.id, 'cultura');
  const semRecrutamento = { ...COMPLETO, rs: { requisicoes: [] } };
  const r = calc(c, semRecrutamento);
  assert.deepEqual(
    [r.completo, r.proximo, r.percentual, r.concluidos, r.concluidosObrigatorios],
    [true, null, 100, 7, 7],
    'sem abrir vaga o cartão já pode sumir'
  );
  const faltaUm = calc(c, { ...COMPLETO, ciclos: [], rs: { requisicoes: [{}] } });
  assert.deepEqual([faltaUm.completo, faltaUm.proximo.id, faltaUm.percentual], [false, 'ciclos', 86]);
});

test('dados ausentes ou vazios não quebram o cálculo', () => {
  const c = ctx();
  for (const d of [undefined, null, {}, { estrutura: null, cargos: null, perfisEmpresa: undefined }])
    assert.equal(rodar(c, `calcularPrimeirosPassosRS(${J(d)}).completo`), false);
});

// ======================= o cartão =======================
test('cartão: empresa nova mostra as boas-vindas, 0 de 7, o próximo passo em destaque e um "Ir" nos demais', () => {
  const c = ctx();
  estado(c, { empresa: {} });
  const h = rodar(c, 'renderPrimeirosPassos()');
  assert.ok(
    h.includes('Bem-vindo(a)! Vamos configurar a sua empresa') &&
      h.includes('0 de 7 concluídos') &&
      h.includes('na ordem que você quiser')
  );
  assert.equal((h.match(/Fazer agora/g) || []).length, 1, 'só o próximo tem "Fazer agora"');
  assert.ok(
    h.includes("goto('empresa')") &&
      h.indexOf('Fazer agora') < h.indexOf("goto('estrutura')") &&
      h.includes('>próximo<')
  );
  assert.equal((h.match(/>Ir</g) || []).length, 7, 'os outros 7 (6 obrigatórios + o opcional) têm "Ir"');
  assert.ok(h.includes('>opcional<') && h.includes("goto('rs_processo')"));
  assert.ok(h.includes('A razão social e o CNPJ aparecem'), 'explica por que o passo importa');
});

test('cartão: no meio do caminho vira "Primeiros passos X de 7", marca o que foi feito e esconde o "por quê" dos concluídos', () => {
  const c = ctx();
  estado(c, { empresa: { estado: 'Ativa' }, estrutura: [{}] });
  const h = rodar(c, 'renderPrimeirosPassos()');
  assert.ok(h.includes('Primeiros passos <small>2 de 7 concluídos') && !h.includes('Bem-vindo'));
  assert.ok(h.includes('✓') && h.includes('(concluído)'));
  assert.ok(
    !h.includes('A razão social e o CNPJ aparecem') && h.includes('Os valores viram critérios'),
    'só os pendentes explicam'
  );
  assert.ok(!h.includes("goto('empresa')") && !h.includes("goto('estrutura')") && h.includes("goto('cultura')"));
});

test('cartão: a barra de progresso é acessível (papel, mínimo, máximo e valor) e acompanha o percentual', () => {
  const c = ctx();
  estado(c, {
    empresa: { estado: 'Ativa' },
    estrutura: [{}],
    cultura: { missao: 'x' },
    cargos: [{ desenho: { aprovado: true } }],
  });
  const h = rodar(c, 'renderPrimeirosPassos()');
  assert.ok(
    /role="progressbar"[^>]*aria-label="Progresso dos primeiros passos"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="57"/.test(
      h
    )
  );
  assert.ok(h.includes('width:57%') && /<ol[^>]*>[\s\S]*<li/.test(h), 'a lista é uma lista de verdade');
});

test('cartão: SOME quando os obrigatórios acabam (mesmo sem a vaga) e quando a pessoa o oculta', () => {
  const c = ctx();
  estado(c, {
    empresa: COMPLETO.empresa,
    estrutura: COMPLETO.estrutura,
    cultura: COMPLETO.cultura,
    cargos: COMPLETO.cargos,
    perfisEmpresa: COMPLETO.perfisEmpresa,
    colaboradores: COMPLETO.colaboradores,
    ciclos: COMPLETO.ciclos,
  });
  assert.equal(rodar(c, 'renderPrimeirosPassos()'), '');
  estado(c, {});
  assert.notEqual(rodar(c, 'renderPrimeirosPassos()'), '');
  estado(c, { configuracoes: { onboardingOculto: true } });
  assert.equal(rodar(c, 'renderPrimeirosPassos()'), '');
});

test('"Ocultar" grava a escolha, salva e redesenha; o botão existe no cartão', () => {
  const c = ctx();
  estado(c, {});
  assert.ok(rodar(c, 'renderPrimeirosPassos()').includes('onclick="ocultarPrimeirosPassosRS()"'));
  rodar(c, 'state.configuracoes = null; ocultarPrimeirosPassosRS()');
  assert.equal(rodar(c, 'state.configuracoes.onboardingOculto'), true);
  assert.deepEqual([c.__salvou, c.__renders], [1, 1]);
  assert.equal(rodar(c, 'renderPrimeirosPassos()'), '');
});

// ======================= integração =======================
test('toda rota dos passos existe no menu do sistema (nenhum botão leva a lugar nenhum)', () => {
  const nav = ler('js/05-navigation.js');
  const c = ctx();
  for (const p of calc(c, {}).passos)
    assert.ok(new RegExp(`id: '${p.rota}'`).test(nav), `rota "${p.rota}" não existe em js/05-navigation.js`);
});

test('as DUAS versões antigas saíram: nenhum resto de "Onboarding do tenant", "renderPendenciasAdmin" ou "renderChecklistOnboarding"', () => {
  for (const f of fs.readdirSync(path.join(raiz, 'js'))) {
    if (!f.endsWith('.js') || f === '52-primeiros-passos.js') continue;
    const s = ler(`js/${f}`);
    assert.ok(
      !/renderPendenciasAdmin|renderChecklistOnboarding|Onboarding do tenant/.test(s),
      `js/${f} ainda tem resto do onboarding antigo`
    );
  }
  assert.ok(!/renderPendenciasAdmin|renderChecklistOnboarding/.test(ler('.eslintrc.json')));
});

test('o painel do Administrador mostra o cartão UMA vez, antes do recrutamento; o do RH, do gestor e do colaborador não', () => {
  const src = ler('js/07-router-dashboard.js');
  assert.equal((src.match(/renderPrimeirosPassos\(\)/g) || []).length, 1);
  assert.ok(
    /renderMinhaAvaliacaoPendente\(\) \+\s*renderPrimeirosPassos\(\) \+\s*renderPendenciasRecrutamento\(\) \+\s*renderDashboardAdmin\(abertos, pdisAtivos, encerrados\)/.test(
      src
    )
  );
  assert.ok(ler('app.html').includes('js/52-primeiros-passos.js'));
});
