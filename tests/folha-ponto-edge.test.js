// =========================================================================
// Testa os ajudantes PUROS da Edge Function "folha-ponto": a detecção real
// do tipo de imagem (pela assinatura dos bytes) e, principalmente, a
// sanitização da resposta da IA — que é dado NÃO confiável e passa por
// aqui antes de chegar no navegador e no banco.
//
// O código testado é o do próprio arquivo .ts (os tipos são removidos
// com o recurso nativo do Node, sem dependência nova).
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');

const suporta = typeof nodeModule.stripTypeScriptTypes === 'function';
const opcoes = suporta ? {} : { skip: 'Node sem stripTypeScriptTypes (use Node 22.13+ pra rodar este teste)' };

function carregarAjudantes() {
  const origem = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'folha-ponto', 'index.ts'),
    'utf8'
  );
  const ini = origem.indexOf('function detectarTipoImagem');
  const fim = origem.indexOf('serve(async');
  assert.ok(ini > 0 && fim > ini, 'não achei o trecho dos ajudantes no arquivo da Edge Function');
  const js = nodeModule.stripTypeScriptTypes(origem.slice(ini, fim));
  const ctx = vm.createContext({
    console,
    Date,
    Math,
    Number,
    JSON,
    Set,
    Array,
    String,
    Uint8Array,
    AbortController,
    setTimeout,
    clearTimeout,
    atob,
  });
  vm.runInContext(js, ctx);
  return ctx;
}

// Objetos criados dentro do vm têm outro Object.prototype — compara via JSON.
const plano = (x) => JSON.parse(JSON.stringify(x));

test('detectarTipoImagem: reconhece JPEG, PNG e WebP pelos bytes reais', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.detectarTipoImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])).mediaType, 'image/jpeg');
  assert.equal(
    c.detectarTipoImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])).mediaType,
    'image/png'
  );
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0]);
  assert.equal(c.detectarTipoImagem(webp).mediaType, 'image/webp');
});

test('detectarTipoImagem: recusa PDF, HTML e executável disfarçados de imagem', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.detectarTipoImagem(new TextEncoder().encode('%PDF-1.4 conteúdo')), null);
  assert.equal(c.detectarTipoImagem(new TextEncoder().encode('<html><script>alert(1)</script></html>')), null);
  assert.equal(c.detectarTipoImagem(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0])), null);
  assert.equal(c.detectarTipoImagem(new Uint8Array([])), null);
});

test('normalizaHora: aceita formatos comuns de letra de mão e recusa o que não é horário', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.normalizaHora('8:05'), '08:05');
  assert.equal(c.normalizaHora('08h30'), '08:30');
  assert.equal(c.normalizaHora('17.30'), '17:30');
  assert.equal(c.normalizaHora(' 12:00 '), '12:00');
  assert.equal(c.normalizaHora('25:00'), null);
  assert.equal(c.normalizaHora('12:60'), null);
  assert.equal(c.normalizaHora('abc'), null);
  assert.equal(c.normalizaHora(''), null);
  assert.equal(c.normalizaHora(830), null);
  assert.equal(c.normalizaHora(null), null);
});

test('diasDoMes: respeita meses de 30/31 dias e fevereiro (inclusive bissexto)', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.diasDoMes('2026-02'), 28);
  assert.equal(c.diasDoMes('2024-02'), 29);
  assert.equal(c.diasDoMes('2026-09'), 30);
  assert.equal(c.diasDoMes('2026-12'), 31);
});

test('sanitizarLeitura: descarta dias fora do mês e duplicados, mantém o primeiro', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(
    c.sanitizarLeitura(
      {
        dias: [
          { dia: 0 },
          { dia: 32 },
          { dia: 5, marcacoes: ['08:00'] },
          { dia: 5, marcacoes: ['09:00'] },
          { dia: 1.5 },
          { dia: '3' },
        ],
      },
      '2026-09'
    )
  );
  assert.deepEqual(
    r.dias.map((d) => d.dia),
    [3, 5]
  );
  assert.deepEqual(r.dias.find((d) => d.dia === 5).marcacoes, ['08:00']);
});

test('sanitizarLeitura: dia 31 não existe em setembro', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(plano(c.sanitizarLeitura({ dias: [{ dia: 31 }] }, '2026-09')).dias.length, 0);
  assert.equal(plano(c.sanitizarLeitura({ dias: [{ dia: 31 }] }, '2026-10')).dias.length, 1);
});

test('sanitizarLeitura: horários inválidos são descartados e geram aviso', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(
    c.sanitizarLeitura({ dias: [{ dia: 1, marcacoes: ['08:00', 'rasurado', '99:99', '17:00'] }] }, '2026-09')
  );
  assert.deepEqual(r.dias[0].marcacoes, ['08:00', '17:00']);
  assert.ok(
    r.avisos.some((a) => a.includes('2 horário')),
    'deveria avisar que 2 horários foram descartados'
  );
});

test('sanitizarLeitura: tipo e confiança inventados voltam pro valor seguro', opcoes, () => {
  const c = carregarAjudantes();
  const d = plano(c.sanitizarLeitura({ dias: [{ dia: 2, tipo: 'hacker', confianca: 'absoluta' }] }, '2026-09')).dias[0];
  assert.equal(d.tipo, 'trabalhado');
  assert.equal(d.confianca, 'media');
});

test('sanitizarLeitura: limita marcações a 8 e a observação a 120 caracteres', opcoes, () => {
  const c = carregarAjudantes();
  const muitas = Array.from({ length: 12 }, (_, i) => `0${i % 10}:00`);
  const d = plano(c.sanitizarLeitura({ dias: [{ dia: 4, marcacoes: muitas, observacao: 'x'.repeat(500) }] }, '2026-09'))
    .dias[0];
  assert.equal(d.marcacoes.length, 8);
  assert.equal(d.observacao.length, 120);
});

test('sanitizarLeitura: devolve os dias em ordem crescente', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(c.sanitizarLeitura({ dias: [{ dia: 20 }, { dia: 3 }, { dia: 11 }] }, '2026-09'));
  assert.deepEqual(
    r.dias.map((d) => d.dia),
    [3, 11, 20]
  );
});

test('sanitizarLeitura: entrada nula, vazia ou de tipo errado não derruba nada', opcoes, () => {
  const c = carregarAjudantes();
  for (const entrada of [null, undefined, {}, { dias: 'texto' }, { dias: [null, 5, 'x'] }, []]) {
    const r = plano(c.sanitizarLeitura(entrada, '2026-09'));
    assert.deepEqual(r.dias, []);
  }
});

test('extrairJson: aceita JSON puro, JSON dentro de cerca de markdown e recusa lixo', opcoes, () => {
  const c = carregarAjudantes();
  assert.deepEqual(plano(c.extrairJson('{"a":1}')), { a: 1 });
  assert.deepEqual(plano(c.extrairJson('Aqui está:\n```json\n{"dias":[]}\n```')), { dias: [] });
  assert.equal(c.extrairJson('não consegui ler a imagem'), null);
  assert.equal(c.extrairJson('{ quebrado'), null);
});

test('montarPrompt: informa mês, total de dias e protege contra instrução escrita na imagem', opcoes, () => {
  const c = carregarAjudantes();
  const p = c.montarPrompt('2026-02', 'Maria Souza');
  assert.ok(p.includes('02/2026') && p.includes('28 dias') && p.includes('Maria Souza'));
  assert.ok(
    p.toLowerCase().includes('nunca instrução'),
    'o prompt precisa mandar ignorar ordens escritas dentro da foto'
  );
});

// ---- Lista de presença do dia ----

test('hojeBrasil: usa UTC−3 — às 01:00 UTC ainda é o dia anterior no Brasil', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.hojeBrasil(Date.UTC(2026, 8, 10, 1, 0, 0)), '2026-09-09');
  assert.equal(c.hojeBrasil(Date.UTC(2026, 8, 10, 3, 0, 0)), '2026-09-10');
  assert.equal(c.hojeBrasil(Date.UTC(2026, 8, 10, 23, 59, 0)), '2026-09-10');
});

test('dataValida: aceita datas reais e recusa datas impossíveis ou lixo', opcoes, () => {
  const c = carregarAjudantes();
  assert.equal(c.dataValida('2026-09-30'), '2026-09-30');
  assert.equal(c.dataValida('2024-02-29'), '2024-02-29'); // bissexto
  assert.equal(c.dataValida('2026-02-29'), null);
  assert.equal(c.dataValida('2026-09-31'), null);
  assert.equal(c.dataValida('2026-13-01'), null);
  assert.equal(c.dataValida('30/09/2026'), null);
  assert.equal(c.dataValida('1999-01-01'), null);
  assert.equal(c.dataValida(null), null);
  assert.equal(c.dataValida(20260930), null);
});

test('sanitizarListaDia: ordena os horários de cada pessoa na ordem do relógio (linhas fora de ordem)', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(
    c.sanitizarListaDia({
      dataLida: '2026-09-10',
      pessoas: [{ nomeLido: 'Maria Souza', horarios: ['17:05', '08:00', '13:01', '12:02'] }],
    })
  );
  assert.deepEqual(r.pessoas[0].horarios, ['08:00', '12:02', '13:01', '17:05']);
  assert.equal(r.dataLida, '2026-09-10');
});

test(
  'sanitizarListaDia: junta o mesmo nome listado duas vezes, sem repetir horário e ficando com a pior confiança',
  opcoes,
  () => {
    const c = carregarAjudantes();
    const r = plano(
      c.sanitizarListaDia({
        pessoas: [
          { nomeLido: 'José Antônio', horarios: ['08:00', '12:00'], confianca: 'alta' },
          { nomeLido: 'jose antonio', horarios: ['12:00', '13:00'], confianca: 'baixa', observacao: 'rasura' },
        ],
      })
    );
    assert.equal(r.pessoas.length, 1);
    assert.deepEqual(r.pessoas[0].horarios, ['08:00', '12:00', '13:00']);
    assert.equal(r.pessoas[0].confianca, 'baixa');
    assert.equal(r.pessoas[0].observacao, 'rasura');
  }
);

test('sanitizarListaDia: horário inválido é descartado com aviso; pessoa sem nome é ignorada', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(
    c.sanitizarListaDia({
      pessoas: [
        { nomeLido: 'Ana', horarios: ['08:00', 'rasurado', '77:00'] },
        { nomeLido: '   ', horarios: ['09:00'] },
        { horarios: ['10:00'] },
      ],
    })
  );
  assert.equal(r.pessoas.length, 1);
  assert.deepEqual(r.pessoas[0].horarios, ['08:00']);
  assert.ok(r.avisos.some((a) => a.includes('2 horário')));
});

test('sanitizarListaDia: pessoa com nome e sem horário é mantida (o RH decide)', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(c.sanitizarListaDia({ pessoas: [{ nomeLido: 'Carlos', horarios: [] }] }));
  assert.equal(r.pessoas.length, 1);
  assert.deepEqual(r.pessoas[0].horarios, []);
});

test('sanitizarListaDia: data inválida vira null; confiança inventada vira "media"', opcoes, () => {
  const c = carregarAjudantes();
  const r = plano(
    c.sanitizarListaDia({
      dataLida: '31/02/2026',
      pessoas: [{ nomeLido: 'Ana', horarios: ['08:00'], confianca: 'total' }],
    })
  );
  assert.equal(r.dataLida, null);
  assert.equal(r.pessoas[0].confianca, 'media');
});

test('sanitizarListaDia: limita horários por pessoa a 8, nome e observação a 120 caracteres', opcoes, () => {
  const c = carregarAjudantes();
  const muitos = Array.from({ length: 12 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
  const r = plano(
    c.sanitizarListaDia({ pessoas: [{ nomeLido: 'N'.repeat(300), horarios: muitos, observacao: 'o'.repeat(300) }] })
  );
  assert.equal(r.pessoas[0].horarios.length, 8);
  assert.equal(r.pessoas[0].nomeLido.length, 120);
  assert.equal(r.pessoas[0].observacao.length, 120);
});

test('sanitizarListaDia: entradas nulas ou de tipo errado não derrubam nada', opcoes, () => {
  const c = carregarAjudantes();
  for (const entrada of [null, undefined, {}, { pessoas: 'x' }, { pessoas: [null, 5, 'a', []] }, []]) {
    const r = plano(c.sanitizarListaDia(entrada));
    assert.deepEqual(r.pessoas, []);
    assert.equal(r.dataLida, null);
  }
});

test('montarPromptListaDia: informa a data de hoje e protege contra instrução escrita na imagem', opcoes, () => {
  const c = carregarAjudantes();
  const p = c.montarPromptListaDia('2026-10-05');
  assert.ok(p.includes('2026-10-05'));
  assert.ok(p.toLowerCase().includes('nunca instrução'));
  assert.ok(p.includes('NUNCA invente'));
});
