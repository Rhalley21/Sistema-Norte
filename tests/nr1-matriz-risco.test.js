// =========================================================================
// Testa nivelRiscoNr1() — a matriz de risco (probabilidade × severidade)
// do módulo NR1. Erro aqui pode classificar um risco psicossocial real
// como "Baixo" quando deveria ser "Crítico" — o tipo de erro que mais
// importa pegar antes de um cliente usar isso de verdade.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const ctx = carregarArquivos(['js/39-page-nr1.js']);

test('nivelRiscoNr1: score baixo (até 4) classifica como Baixo', () => {
  assert.equal(ctx.nivelRiscoNr1(1, 1).nivel, 'Baixo'); // score 1
  assert.equal(ctx.nivelRiscoNr1(2, 2).nivel, 'Baixo'); // score 4, limite exato
});

test('nivelRiscoNr1: score médio (5 a 9) classifica como Médio', () => {
  assert.equal(ctx.nivelRiscoNr1(1, 5).nivel, 'Médio'); // score 5, logo após o limite de Baixo
  assert.equal(ctx.nivelRiscoNr1(3, 3).nivel, 'Médio'); // score 9, limite exato
});

test('nivelRiscoNr1: score alto (10 a 15) classifica como Alto', () => {
  assert.equal(ctx.nivelRiscoNr1(2, 5).nivel, 'Alto'); // score 10, logo após o limite de Médio
  assert.equal(ctx.nivelRiscoNr1(3, 5).nivel, 'Alto'); // score 15, limite exato
});

test('nivelRiscoNr1: score acima de 15 classifica como Crítico', () => {
  assert.equal(ctx.nivelRiscoNr1(4, 4).nivel, 'Crítico'); // score 16
  assert.equal(ctx.nivelRiscoNr1(5, 5).nivel, 'Crítico'); // score 25, máximo da matriz 5×5
});

test('nivelRiscoNr1: o score retornado é sempre probabilidade × severidade', () => {
  assert.equal(ctx.nivelRiscoNr1(3, 4).score, 12);
  assert.equal(ctx.nivelRiscoNr1(5, 2).score, 10);
});
