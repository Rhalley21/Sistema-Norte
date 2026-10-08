// =========================================================================
// Testa as sugestões automáticas do FAQ da Central de Ajuda (sem IA) e
// garante que o FAQ não contradiz o próprio sistema: limites de plano,
// regra de bloqueio de login, pesos do ciclo e nomes de menu citados.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const ctx = carregarArquivos(['js/41-page-central-ajuda.js']);
const plano = (x) => JSON.parse(JSON.stringify(x));
const raiz = path.join(__dirname, '..');
const faq = plano(vm.runInContext('FAQ_CENTRAL', ctx)); // const de topo não vira propriedade do contexto
const perguntas = (texto) => plano(ctx.faqSugestoes(texto)).map((i) => i.p);

test('faqSugestoes: reconhece dúvida de senha e de login bloqueado', () => {
  assert.ok(perguntas('esqueci minha senha').some((p) => p.includes('senha')));
  assert.ok(perguntas('não consigo entrar, meu login está bloqueado').some((p) => p.includes('bloqueado')));
});

test('faqSugestoes: ignora acento e maiúsculas', () => {
  assert.ok(perguntas('ATESTADO MÉDICO e FALTA').some((p) => p.includes('justifico')));
});

test('faqSugestoes: texto sem relação, vazio ou só de palavras comuns não sugere nada', () => {
  assert.deepEqual(perguntas('xyzzy qwerty'), []);
  assert.deepEqual(perguntas(''), []);
  assert.deepEqual(perguntas('como para que uma com'), []);
  assert.deepEqual(perguntas(null), []);
});

test('faqSugestoes: devolve no máximo 3 e a mais parecida vem primeiro', () => {
  const r = perguntas('convidar convite acesso codigo cadastrar ponto plano senha');
  assert.ok(r.length <= 3);
  assert.ok(r[0].includes('convido'));
});

test('faqSugestoes: palavra-chave exata basta; uma palavra só PARECIDA (1 ponto) não basta', () => {
  assert.ok(perguntas('senha').length > 0);
  assert.deepEqual(perguntas('senhas'), []); // começa igual a "senha", mas isso sozinho vale só 1 ponto
});

test('FAQ: toda pergunta é encontrada pela própria busca (as palavras-chave funcionam)', () => {
  faq.forEach((item) => {
    assert.ok(perguntas(item.p).includes(item.p), `a pergunta não se acha sozinha: "${item.p}"`);
  });
});

test('FAQ: palavras-chave são uma palavra só, minúsculas e sem acento (senão nunca casam)', () => {
  faq.forEach((item) => {
    assert.ok(item.p && item.r && item.k.length >= 3, `entrada incompleta: ${item.p}`);
    item.k.forEach((kw) => {
      assert.equal(kw, plano(ctx.faqNormalizar(kw)).trim(), `palavra-chave fora do padrão: "${kw}"`);
      assert.ok(!/\s/.test(kw), `palavra-chave com espaço nunca casa: "${kw}"`);
    });
  });
});

test('FAQ: não há perguntas repetidas', () => {
  const textos = faq.map((i) => i.p);
  assert.equal(new Set(textos).size, textos.length);
});

test('FAQ não contradiz o sistema: limites de plano, bloqueio de login e ciclo', () => {
  const todas = faq.map((i) => i.r).join('\n');
  const pag = carregarArquivos(['js/31-page-pagamento.js']);
  [
    ['Essencial', 10],
    ['Gestão', 30],
    ['Estratégico', 60],
  ].forEach(([nome, limite]) => {
    pag.state.empresa = { faturamento: { plano: nome } };
    assert.equal(pag.limiteColaboradoresDaEmpresa().limite, limite);
    assert.ok(todas.includes(`${nome} até ${limite}`), `o FAQ não cita "${nome} até ${limite}"`);
  });
  const auth = fs.readFileSync(path.join(raiz, 'js', '19-auth.js'), 'utf8');
  assert.ok(todas.includes(`${/LOGIN_MAX_TENTATIVAS = (\d+)/.exec(auth)[1]} tentativas`));
  assert.ok(todas.includes(`${/LOGIN_BLOQUEIO_MINUTOS = (\d+)/.exec(auth)[1]} minutos`));
  assert.ok(todas.includes('25/50/25') && todas.includes('D-5, D-2 e D-0'));
});

test('FAQ: todo nome de tela citado existe no menu do sistema', () => {
  const menu = fs.readFileSync(path.join(raiz, 'js', '05-navigation.js'), 'utf8');
  const todas = faq.map((i) => i.r).join('\n');
  [
    ['Usuários & Acesso', 'Usuários & Acesso'],
    ['Colaboradores', 'Colaboradores'],
    ['Ciclos de Avaliação', 'Ciclos de Avaliação'],
    ['Totem de ponto', 'Totem de ponto'],
    ['Folha de Ponto (papel)', 'Folha de Ponto (papel)'],
    ['Relatórios', 'Relatórios'],
    ['Pagamento', 'Pagamento'],
    ['Diagnóstico & PDI', 'Diagnóstico & PDI'],
  ].forEach(([citado, rotulo]) => {
    assert.ok(todas.includes(citado), `o FAQ não cita mais "${citado}"`);
    assert.ok(menu.includes(`label: '${rotulo}`), `o menu não tem "${rotulo}" — atualize o FAQ`);
  });
});

test('FAQ: o acesso sem e-mail aponta pra tela onde a opção realmente existe', () => {
  const colab = fs.readFileSync(path.join(raiz, 'js', '13-page-colaboradores.js'), 'utf8');
  assert.ok(
    colab.includes('Criar acesso sem e-mail'),
    'a opção saiu da tela Colaboradores — atualize o FAQ e a base do assistente'
  );
  const resposta = faq.find((i) => i.p.includes('não tem e-mail')).r;
  assert.ok(resposta.includes('Colaboradores') && resposta.includes('Criar acesso sem e-mail'));
});

test('faqSugestoes: só mostra sugestões que chegam perto da melhor (sem ruído de uma palavra solta)', () => {
  const r = perguntas('Não consigo entrar, meu login está bloqueado');
  assert.equal(r.length, 1);
  assert.ok(r[0].includes('bloqueado'));
});
