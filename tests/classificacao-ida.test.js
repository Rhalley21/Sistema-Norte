// =========================================================================
// Testa classificar() — a função que decide se um indicador fica como
// Iniciar / Desenvolver / Alavancar a partir da média das notas. Erro
// aqui afeta diagnóstico, PDI e todos os dashboards que mostram essa
// classificação — por isso é um dos cálculos mais críticos do sistema.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const ctx = carregarArquivos(['js/02-core-helpers.js']);

test('classificar: média muito baixa vira Iniciar (I)', () => {
  assert.equal(ctx.classificar(0), 'I');
  assert.equal(ctx.classificar(0.2), 'I');
  assert.equal(ctx.classificar(0.33), 'I'); // limite exato incluído
});

test('classificar: média intermediária vira Desenvolver (D)', () => {
  assert.equal(ctx.classificar(0.34), 'D'); // logo depois do limite de Iniciar
  assert.equal(ctx.classificar(0.5), 'D');
  assert.equal(ctx.classificar(0.66), 'D'); // limite exato incluído
});

test('classificar: média alta vira Alavancar (A)', () => {
  assert.equal(ctx.classificar(0.67), 'A'); // logo depois do limite de Desenvolver
  assert.equal(ctx.classificar(0.9), 'A');
  assert.equal(ctx.classificar(1), 'A');
});

test('classificar: espera um número — não é feita nenhuma suposição sobre null/undefined', () => {
  // classificar() espera a MÉDIA já calculada (um número). Quem quer
  // proteger contra "sem dado" deve usar pillClass()/pillLabel() (abaixo),
  // que trabalham em cima da LETRA (I/D/A) já classificada.
  assert.equal(typeof ctx.classificar(0.5), 'string');
});

test('pillClass: sem classificação (null/undefined) NUNCA vira "Alavancar" por acidente', () => {
  // BUG CORRIGIDO nesta sessão: qualquer valor que não fosse exatamente
  // 'I' ou 'D' caía no `else` final e virava 'pill-alavancar' — incluindo
  // null/undefined (sem dado nenhum). Um diagnóstico incompleto podia
  // aparecer visualmente como "Alavancar" (a melhor nota possível) em vez
  // de mostrar que não há dado. Este teste tranca esse comportamento.
  assert.equal(ctx.pillClass(null), 'pill-neutral');
  assert.equal(ctx.pillClass(undefined), 'pill-neutral');
  assert.equal(ctx.pillClass('letra-invalida'), 'pill-neutral');
});

test('pillClass: classificações válidas mapeiam pra pill certa', () => {
  assert.equal(ctx.pillClass('I'), 'pill-iniciar');
  assert.equal(ctx.pillClass('D'), 'pill-desenvolver');
  assert.equal(ctx.pillClass('A'), 'pill-alavancar');
});
