// =========================================================================
// Testa precoVigentePlano() e limiteColaboradoresDaEmpresa() — decidem
// quanto cobrar e quantos colaboradores uma empresa pode cadastrar. Erro
// aqui é dinheiro saindo errado da conta de um cliente de verdade.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const ctx = carregarArquivos(['js/31-page-pagamento.js']);
const planoTeste = { precoNovo: 297, precoAtual: 197 };

function diasAtras(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

test('precoVigentePlano: dentro dos 12 meses de contrato, usa o preço com desconto', () => {
  ctx.state.empresa = { faturamento: { dataInicio: diasAtras(90) } }; // 3 meses atrás
  const r = ctx.precoVigentePlano(planoTeste);
  assert.equal(r.valor, 197);
  assert.equal(r.comDesconto, true);
});

test('precoVigentePlano: depois de 12 meses, volta pro valor cheio', () => {
  ctx.state.empresa = { faturamento: { dataInicio: diasAtras(400) } }; // mais de 12 meses atrás
  const r = ctx.precoVigentePlano(planoTeste);
  assert.equal(r.valor, 297);
  assert.equal(r.comDesconto, false);
});

test('precoVigentePlano: a 364 dias do início, ainda está dentro do desconto', () => {
  // Evita testar o limite exato de 365 dias — o cálculo usa a hora exata,
  // não só a data (ver 366 dias abaixo), então o resultado bem na borda
  // varia conforme a hora do dia em que o teste roda. 364 é estável.
  ctx.state.empresa = { faturamento: { dataInicio: diasAtras(364) } };
  const r = ctx.precoVigentePlano(planoTeste);
  assert.equal(r.comDesconto, true);
});

test('precoVigentePlano: a 366 dias do início, já perdeu o desconto', () => {
  ctx.state.empresa = { faturamento: { dataInicio: diasAtras(366) } };
  const r = ctx.precoVigentePlano(planoTeste);
  assert.equal(r.comDesconto, false);
});

test('precoVigentePlano: sem data de início cadastrada, usa o valor cheio (nunca quebra)', () => {
  ctx.state.empresa = { faturamento: {} };
  const r = ctx.precoVigentePlano(planoTeste);
  assert.equal(r.valor, 297);
  assert.equal(r.comDesconto, false);
});

test('limiteColaboradoresDaEmpresa: cada plano retorna o limite certo', () => {
  ctx.state.empresa = { faturamento: { plano: 'Essencial' } };
  assert.equal(ctx.limiteColaboradoresDaEmpresa().limite, 10);
  ctx.state.empresa = { faturamento: { plano: 'Gestão' } };
  assert.equal(ctx.limiteColaboradoresDaEmpresa().limite, 30);
  ctx.state.empresa = { faturamento: { plano: 'Estratégico' } };
  assert.equal(ctx.limiteColaboradoresDaEmpresa().limite, 60);
});

test('limiteColaboradoresDaEmpresa: sem plano definido, cai no menor (Essencial) por segurança', () => {
  ctx.state.empresa = { faturamento: {} };
  assert.equal(ctx.limiteColaboradoresDaEmpresa().plano, 'Essencial');
  assert.equal(ctx.limiteColaboradoresDaEmpresa().limite, 10);
});

test('limiteColaboradoresDaEmpresa: nome de plano inválido/digitado errado também cai no Essencial', () => {
  ctx.state.empresa = { faturamento: { plano: 'Plano Que Não Existe' } };
  assert.equal(ctx.limiteColaboradoresDaEmpresa().plano, 'Essencial');
});
