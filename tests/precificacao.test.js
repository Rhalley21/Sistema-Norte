// =========================================================================
// Testa os preços dos planos (sem fidelidade) e limiteColaboradoresDaEmpresa() — decidem
// quanto cobrar e quantos colaboradores uma empresa pode cadastrar. Erro
// aqui é dinheiro saindo errado da conta de um cliente de verdade.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const fs = require('fs');
const path = require('path');
const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const vm = require('vm');
const ctx = carregarArquivos(['js/31-page-pagamento.js']);
const PLANOS = () => vm.runInContext('PLANOS_NORTE', ctx); // const não vira propriedade do contexto
const plano = (x) => JSON.parse(JSON.stringify(x));

// Sem fidelidade: a mensalidade é a mesma em todos os meses (decisão: tirar a fidelidade e ficar com os valores normais).
test('a tabela de planos: mensalidade e implantação certas, sem preço de fidelidade nem desconto de "cliente atual"', () => {
  assert.deepEqual(
    plano(PLANOS()).map((p) => [p.nome, p.limiteColaboradores, p.preco, p.implantacao]),
    [
      ['Essencial', 10, 297, 590],
      ['Gestão', 30, 597, 990],
      ['Estratégico', 60, 997, 1490],
    ]
  );
  for (const p of PLANOS()) {
    assert.ok(!('precoAtual' in p) && !('precoNovo' in p), `${p.nome} ainda tem campo de fidelidade`);
  }
  assert.equal(typeof ctx.precoVigentePlano, 'undefined', 'a função do desconto de 12 meses não deve existir mais');
});

test('a tela de Pagamento mostra o mesmo valor em qualquer época do contrato (nunca "preço especial" nem "valor cheio")', () => {
  for (const dias of [30, 400]) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    ctx.state.empresa = { faturamento: { plano: 'Essencial', dataInicio: d.toISOString().slice(0, 10) } };
    const html = ctx.pagePagamento();
    for (const v of ['297,00', '597,00', '997,00']) assert.ok(html.includes(v), `${v} (contrato com ${dias} dias)`);
    assert.ok(
      !/Preço especial|Valor cheio|condição especial|197,00|397,00|697,00/.test(html),
      `sobrou texto de fidelidade (${dias} dias)`
    );
  }
});

test('as páginas de planos (planos.html e a página inicial) mostram só os valores normais, sem seletor de fidelidade', () => {
  for (const arq of ['planos.html', 'index.html']) {
    const h = ler(arq);
    const precos = [...h.matchAll(/<div class="price">\s*<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    assert.deepEqual(precos, ['R$ 297', 'R$ 597', 'R$ 997'], arq);
    const impl = [...h.matchAll(/Implantação \(única vez\):\s*<b>([^<]+)<\/b>/g)].map((m) => m[1]);
    assert.deepEqual(impl, ['R$ 590,00', 'R$ 990,00', 'R$ 1.490,00'], arq);
    for (const proibido of [
      'data-loy',
      'data-std',
      'setMode',
      'Fidelidade 12 meses',
      'condição de fidelidade',
      'Preço com fidelidade',
      'class="tgl"',
      'class="old"',
    ]) {
      assert.ok(!h.includes(proibido), `${arq} ainda tem: ${proibido}`);
    }
  }
});

test('a tela de entrada do sistema mostra o mesmo preço normal dos planos', () => {
  const e = ler('js/35-tela-entrada.js');
  assert.ok(e.includes('p.preco') && !e.includes('precoNovo'));
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
