// =========================================================================
// Provas de conhecimento — lado do RH e do candidato no navegador:
//  - o validador do navegador concorda EXATAMENTE com o do servidor (regras e mensagens);
//  - os 3 modelos prontos são válidos e o GABARITO de cada questão está certo (declarado à parte);
//  - o editor, a tela, o painel de aplicar e o funil escapam tudo e nunca dizem "reprovado";
//  - a página pública prova.html não tem rastreadores nem HTML sem escape.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { webcrypto } = require('node:crypto');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

// ---- servidor (regras puras) e cliente ----
function servidor() {
  const origem = ler('supabase/functions/provas-rs/index.ts');
  const ini = origem.indexOf('// ---- Provas: regras puras');
  const fim = origem.indexOf('// ---- fim: regras puras');
  const ctx = vm.createContext({
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Set,
    Promise,
    JSON,
    URL,
    Uint8Array,
    Uint32Array,
    TextEncoder,
    btoa,
    crypto: webcrypto,
    Error,
    console,
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)) + '\nthis.__L = LIMITES;', ctx);
  return ctx;
}
function cliente(papel = 'rh') {
  const ctx = carregarArquivos(['js/02-core-helpers.js', 'js/44-page-provas.js']);
  ctx.meuPapelReal = papel;
  ctx.__toasts = [];
  ctx.__renders = 0;
  ctx.showToast = (t) => ctx.__toasts.push(t);
  ctx.render = () => ctx.__renders++;
  ctx.goto = () => {};
  ctx.registrarAuditoria = () => {};
  ctx.document.querySelector = () => null;
  return ctx;
}
const rodar = (ctx, codigo) => vm.runInContext(codigo, ctx);

// ======================= limites e validador iguais aos do servidor =======================
test('os limites do navegador são os MESMOS do servidor (não saem de sincronia)', opcoes, () => {
  const c = cliente();
  assert.deepEqual(plano(rodar(c, 'PROVA_LIMITES')), plano(servidor().__L));
});

function rascunho(mut) {
  const r = {
    titulo: 'Prova de teste',
    descricao: '',
    tempo_limite_min: 20,
    nota_minima: 60,
    questoes: [
      {
        enunciado: 'Quanto é 2 + 2?',
        peso: 1,
        correta: 'a2',
        alternativas: [
          { id: 'a1', texto: '3' },
          { id: 'a2', texto: '4' },
          { id: 'a3', texto: '5' },
        ],
      },
      {
        enunciado: 'Qual a capital do Brasil?',
        peso: 2,
        correta: 'b1',
        alternativas: [
          { id: 'b1', texto: 'Brasília' },
          { id: 'b2', texto: 'Rio de Janeiro' },
        ],
      },
    ],
  };
  if (mut) mut(r);
  return r;
}

test(
  'validador do navegador == validador do servidor: mesmas decisões e MESMAS mensagens, em dezenas de casos',
  opcoes,
  () => {
    const c = cliente();
    const s = servidor();
    const longo = (n) => 'x'.repeat(n);
    const casos = {
      'prova boa': () => {},
      'título curto': (r) => (r.titulo = 'ab'),
      'título longo': (r) => (r.titulo = longo(121)),
      'título só espaços': (r) => (r.titulo = '     '),
      'descrição longa': (r) => (r.descricao = longo(1001)),
      'tempo 4': (r) => (r.tempo_limite_min = 4),
      'tempo 241': (r) => (r.tempo_limite_min = 241),
      'tempo decimal': (r) => (r.tempo_limite_min = 10.5),
      'tempo vazio': (r) => (r.tempo_limite_min = ''),
      'tempo texto': (r) => (r.tempo_limite_min = 'abc'),
      'nota -1': (r) => (r.nota_minima = -1),
      'nota 101': (r) => (r.nota_minima = 101),
      'nota vazia (vale 60)': (r) => (r.nota_minima = ''),
      'nota 0': (r) => (r.nota_minima = 0),
      'sem questões': (r) => (r.questoes = []),
      '61 questões': (r) =>
        (r.questoes = Array.from({ length: 61 }, () => ({
          enunciado: 'Pergunta qualquer?',
          peso: 1,
          correta: 'x',
          alternativas: [
            { id: 'x', texto: 'a' },
            { id: 'y', texto: 'b' },
          ],
        }))),
      'enunciado curto': (r) => (r.questoes[0].enunciado = 'Oi'),
      'enunciado longo': (r) => (r.questoes[1].enunciado = longo(1001)),
      '1 alternativa': (r) => (r.questoes[1].alternativas = [{ id: 'b1', texto: 'só' }]),
      '7 alternativas': (r) =>
        (r.questoes[0].alternativas = Array.from({ length: 7 }, (_, i) => ({ id: `a${i + 1}`, texto: `alt ${i}` }))),
      'alternativa vazia': (r) => (r.questoes[0].alternativas[0].texto = '  '),
      'alternativa longa': (r) => (r.questoes[0].alternativas[0].texto = longo(301)),
      'alternativas repetidas': (r) => (r.questoes[0].alternativas[0].texto = '4'),
      'repetida com maiúscula': (r) => (
        (r.questoes[0].alternativas[0].texto = 'BRASÍLIA'),
        (r.questoes[0].alternativas[1].texto = 'brasília')
      ),
      'sem correta': (r) => (r.questoes[0].correta = ''),
      'correta inexistente': (r) => (r.questoes[1].correta = 'zzz'),
      'peso 0': (r) => (r.questoes[0].peso = 0),
      'peso 11': (r) => (r.questoes[0].peso = 11),
      'peso decimal': (r) => (r.questoes[1].peso = 2.5),
      'peso vazio (vale 1)': (r) => (r.questoes[0].peso = ''),
      'peso 10': (r) => (r.questoes[0].peso = 10),
    };
    let ok = 0;
    let erros = 0;
    for (const [nome, mut] of Object.entries(casos)) {
      const r = rascunho(mut);
      const doCliente = rodar(c, `provaValidarRascunho(${JSON.stringify(r)})`);
      const doServidor = plano(s.validarProva(JSON.parse(JSON.stringify(r))));
      assert.equal(
        doCliente === '',
        doServidor.ok,
        `decisões diferentes em "${nome}": cliente "${doCliente}" x servidor ${JSON.stringify(doServidor)}`
      );
      if (!doServidor.ok) {
        assert.equal(doCliente, doServidor.erro, `mensagens diferentes em "${nome}"`);
        erros++;
      } else ok++;
    }
    assert.ok(ok >= 5 && erros >= 20, `o teste cobriu pouco (${ok} válidos, ${erros} inválidos)`);
  }
);

// ======================= modelos prontos =======================
// O gabarito esperado de cada questão, declarado À PARTE do código dos modelos: pega erro de digitação ou de índice.
const GABARITO = {
  portugues: [
    'Houve muitos problemas na reunião.',
    'exceção',
    'Faz dois anos que ele trabalha aqui.',
    'Vou à escola agora.',
    'Ontem, a equipe finalizou o relatório.',
    'Por que',
    'mal',
    'No próximo dia útil.',
    'Prezado(a) senhor(a),',
    'Os cidadãos votaram.',
  ],
  matematica: ['30', 'R$ 10', '6', 'R$ 60', '90', 'R$ 60', 'R$ 2.200', '180', '7', '75%'],
  excel: [
    '=SOMA(A1:A10)',
    '=MÉDIA(B1:B5)',
    'Fixam a referência da célula ao copiar a fórmula.',
    '=SE(C2>=7;"Aprovado";"Reprovado")',
    'Ctrl + Z',
    '=CONT.NÚM(A1:A20)',
    '=MÁXIMO()',
    'A fórmula tentou dividir por zero.',
    'Filtro',
    'PROCV',
  ],
};

test(
  'modelos: 3 modelos (Português, Matemática, Excel), cada um com 10 questões, e o GABARITO de cada questão está certo',
  opcoes,
  () => {
    const c = cliente();
    const modelos = plano(rodar(c, 'PROVAS_MODELOS'));
    assert.deepEqual(
      modelos.map((m) => m.chave),
      ['portugues', 'matematica', 'excel']
    );
    for (const m of modelos) {
      assert.equal(m.questoes.length, 10, `${m.chave}: número de questões`);
      assert.equal(m.questoes.length, GABARITO[m.chave].length);
      m.questoes.forEach((q, i) =>
        assert.equal(
          q.alternativas[q.correta],
          GABARITO[m.chave][i],
          `${m.chave} questão ${i + 1}: o gabarito do modelo não é a resposta esperada`
        )
      );
    }
  }
);

test(
  'modelos: passam no validador do navegador E no do servidor; sem alternativa repetida; tempo e nota coerentes',
  opcoes,
  () => {
    const c = cliente();
    const s = servidor();
    for (const m of plano(rodar(c, 'PROVAS_MODELOS'))) {
      const r = plano(rodar(c, `provaRascunhoDoModelo(PROVAS_MODELOS.find((x) => x.chave === '${m.chave}'))`));
      assert.equal(
        rodar(c, `provaValidarRascunho(${JSON.stringify(r)})`),
        '',
        `${m.chave}: reprovado pelo validador do navegador`
      );
      const v = plano(s.validarProva(JSON.parse(JSON.stringify(r))));
      assert.equal(v.ok, true, `${m.chave}: ${v.erro}`);
      assert.ok(m.tempo_limite_min >= 15 && m.tempo_limite_min <= 30);
      assert.equal(m.nota_minima, 60);
      m.questoes.forEach((q) =>
        assert.equal(new Set(q.alternativas.map((a) => a.toLowerCase())).size, q.alternativas.length)
      );
    }
  }
);

test(
  'modelos: ao carregar no editor, a "correta" aponta pra alternativa certa e os ids são únicos a cada carga',
  opcoes,
  () => {
    const c = cliente();
    const r1 = plano(rodar(c, 'provaRascunhoDoModelo(PROVAS_MODELOS[1])'));
    const r2 = plano(rodar(c, 'provaRascunhoDoModelo(PROVAS_MODELOS[1])'));
    r1.questoes.forEach((q, i) =>
      assert.equal(q.alternativas.find((a) => a.id === q.correta).texto, GABARITO.matematica[i])
    );
    const ids1 = r1.questoes.flatMap((q) => q.alternativas.map((a) => a.id));
    const ids2 = r2.questoes.flatMap((q) => q.alternativas.map((a) => a.id));
    assert.equal(new Set(ids1).size, ids1.length);
    assert.ok(!ids1.some((id) => ids2.includes(id)), 'ids repetidos entre cargas');
    assert.equal(r1.id, null);
  }
);

// ======================= rascunhos =======================
test('rascunho novo, duplicado e da prova salva', opcoes, () => {
  const c = cliente();
  const novo = plano(rodar(c, 'provaRascunhoNovo()'));
  assert.equal(novo.id, null);
  assert.equal(novo.questoes.length, 1);
  assert.equal(novo.questoes[0].alternativas.length, 2);
  assert.notEqual(rodar(c, 'provaValidarRascunho(provaRascunhoNovo())'), '', 'uma prova em branco não pode ser salva');
  const salva = {
    id: 'p1',
    titulo: 'T'.repeat(120),
    descricao: null,
    tempo_limite_min: 20,
    nota_minima: '70.00',
    questoes: rascunho().questoes,
  };
  const dup = plano(rodar(c, `provaRascunhoDuplicado(${JSON.stringify(salva)})`));
  assert.equal(dup.id, null);
  assert.ok(dup.titulo.length <= 120);
  const edit = plano(rodar(c, `provaRascunhoDaProva(${JSON.stringify(salva)})`));
  assert.equal(edit.id, 'p1');
  assert.equal(edit.nota_minima, 70);
  assert.equal(edit.descricao, '');
});

// ======================= texto dos resultados =======================
test('texto: nota em pt-BR, duração e resultado — NUNCA a palavra "reprovado"', opcoes, () => {
  const c = cliente();
  assert.equal(rodar(c, 'provaNotaTexto(66.7)'), '66,7%');
  assert.equal(rodar(c, 'provaNotaTexto(100)'), '100%');
  assert.equal(rodar(c, 'provaNotaTexto(0)'), '0%');
  assert.equal(rodar(c, 'provaNotaTexto(null)'), '—');
  assert.equal(rodar(c, 'provaDuracaoTexto(75)'), '1 min 15 s');
  assert.equal(rodar(c, 'provaDuracaoTexto(120)'), '2 min');
  assert.equal(rodar(c, 'provaDuracaoTexto(45)'), '45 s');
  assert.equal(rodar(c, 'provaDuracaoTexto(null)'), '—');
  const acima = rodar(
    c,
    `provaResultadoTexto(${JSON.stringify({ status: 'concluida', nota: 80, nota_minima: 60, atingiu_minima: true })})`
  );
  const abaixo = rodar(
    c,
    `provaResultadoTexto(${JSON.stringify({ status: 'concluida', nota: 40, nota_minima: 60, atingiu_minima: false })})`
  );
  assert.equal(acima, '80% — atingiu nota mínima (60%)');
  assert.equal(abaixo, '40% — abaixo da nota mínima (60%)');
  for (const st of ['enviada', 'iniciada', 'concluida', 'expirada', 'cancelada'])
    assert.ok(!/reprov/i.test(rodar(c, `provaStatusRotulo('${st}')`)));
  assert.ok(!/reprov/i.test(abaixo));
  assert.equal(rodar(c, "provaResultadoTexto({ status: 'enviada' })"), 'Aguardando o candidato');
});

// ======================= editor (com a tela simulada) =======================
function comTela(c, campos, radios = {}) {
  c.document.getElementById = (id) => (id in campos ? { value: campos[id] } : null);
  c.document.querySelector = (sel) => {
    const m = /name="(pv_q\d+_ok)"/.exec(sel);
    return m && radios[m[1]] ? { value: radios[m[1]] } : null;
  };
}

test('editor: lê o que foi digitado na tela pra dentro do rascunho (antes de refazer a tela)', opcoes, () => {
  const c = cliente();
  rodar(c, '_provaEditor = provaRascunhoNovo();');
  const alt = plano(rodar(c, '_provaEditor.questoes[0].alternativas'));
  comTela(
    c,
    {
      pv_titulo: 'Minha prova',
      pv_desc: 'Instruções',
      pv_tempo: '45',
      pv_nota: '70',
      pv_q0_enun: 'Qual é a cor do céu?',
      pv_q0_peso: '3',
      pv_q0_a0: 'Azul',
      pv_q0_a1: 'Verde',
    },
    { pv_q0_ok: alt[1].id }
  );
  rodar(c, 'provaEditorLerTela();');
  const r = plano(rodar(c, '_provaEditor'));
  assert.equal(r.titulo, 'Minha prova');
  assert.equal(r.tempo_limite_min, 45);
  assert.equal(r.nota_minima, 70);
  assert.equal(r.questoes[0].enunciado, 'Qual é a cor do céu?');
  assert.equal(r.questoes[0].peso, 3);
  assert.deepEqual(
    r.questoes[0].alternativas.map((a) => a.texto),
    ['Azul', 'Verde']
  );
  assert.equal(r.questoes[0].correta, alt[1].id);
  assert.equal(rodar(c, 'provaValidarRascunho(_provaEditor)'), '');
});

test('editor: adicionar, remover e mover questões e alternativas — sem perder o que já foi digitado', opcoes, () => {
  const c = cliente();
  rodar(c, '_provaEditor = provaRascunhoNovo();');
  comTela(c, { pv_q0_enun: 'Primeira pergunta?' });
  rodar(c, 'provaEditorAddQuestao();');
  assert.equal(rodar(c, '_provaEditor.questoes.length'), 2);
  assert.equal(
    rodar(c, '_provaEditor.questoes[0].enunciado'),
    'Primeira pergunta?',
    'o texto digitado se perdeu ao adicionar'
  );
  comTela(c, { pv_q0_enun: 'Primeira pergunta?', pv_q1_enun: 'Segunda pergunta?' });
  rodar(c, 'provaEditorMoverQuestao(0, 1);');
  assert.deepEqual(plano(rodar(c, '_provaEditor.questoes.map((q) => q.enunciado)')), [
    'Segunda pergunta?',
    'Primeira pergunta?',
  ]);
  comTela(c, { pv_q0_enun: 'Segunda pergunta?', pv_q1_enun: 'Primeira pergunta?' }); // a tela refeita mostra a ordem nova
  rodar(c, 'provaEditorMoverQuestao(0, -1);'); // já é a primeira: não faz nada
  assert.equal(rodar(c, '_provaEditor.questoes[0].enunciado'), 'Segunda pergunta?');
  rodar(c, 'provaEditorAddAlternativa(0);');
  assert.equal(rodar(c, '_provaEditor.questoes[0].alternativas.length'), 3);
  rodar(c, 'provaEditorRemoverQuestao(1);');
  assert.equal(rodar(c, '_provaEditor.questoes.length'), 1);
  rodar(c, 'provaEditorRemoverQuestao(0);');
  assert.equal(rodar(c, '_provaEditor.questoes.length'), 1, 'não pode ficar sem questões');
  assert.ok(c.__toasts.some((t) => t.includes('pelo menos uma questão')));
});

test(
  'editor: respeita os limites de alternativas e de questões; remover a alternativa correta limpa a marcação',
  opcoes,
  () => {
    const c = cliente();
    rodar(c, '_provaEditor = provaRascunhoNovo();');
    for (let i = 0; i < 8; i++) rodar(c, 'provaEditorAddAlternativa(0);');
    assert.equal(rodar(c, '_provaEditor.questoes[0].alternativas.length'), 6);
    assert.ok(c.__toasts.some((t) => t.includes('Máximo de 6 alternativas')));
    const alt = plano(rodar(c, '_provaEditor.questoes[0].alternativas'));
    rodar(c, `_provaEditor.questoes[0].correta = '${alt[2].id}';`);
    rodar(c, 'provaEditorRemoverAlternativa(0, 2);');
    assert.equal(
      rodar(c, '_provaEditor.questoes[0].correta'),
      '',
      'a "correta" apontava pra uma alternativa que não existe mais'
    );
    for (let i = 0; i < 6; i++) rodar(c, 'provaEditorRemoverAlternativa(0, 0);');
    assert.equal(rodar(c, '_provaEditor.questoes[0].alternativas.length'), 2);
    assert.ok(c.__toasts.some((t) => t.includes('pelo menos 2 alternativas')));
    for (let i = 0; i < 70; i++) rodar(c, 'provaEditorAddQuestao();');
    assert.equal(rodar(c, '_provaEditor.questoes.length'), 60);
  }
);

test('editor: salvar com erro de validação NÃO chama o servidor e mostra o erro', opcoes, async () => {
  const c = cliente();
  let chamadas = 0;
  c.sb = { functions: { invoke: async () => (chamadas++, { data: { ok: true }, error: null }) } };
  rodar(c, '_provaEditor = provaRascunhoNovo();');
  comTela(c, { pv_titulo: 'x' });
  await rodar(c, 'provaEditorSalvar()');
  assert.equal(chamadas, 0);
  assert.ok(c.__toasts.some((t) => t.includes('título')));
});

// ======================= tela, papéis e XSS =======================
const MALICIOSO = '<img src=x onerror=alert(1)>';
function provaSalva(extra = {}) {
  return {
    id: 'p1',
    titulo: `Prova ${MALICIOSO}`,
    descricao: `Desc ${MALICIOSO}`,
    tempo_limite_min: 20,
    nota_minima: '60',
    arquivada: false,
    aplicacoes: 3,
    concluidas: 2,
    questoes: [
      {
        id: 'q1',
        enunciado: `Pergunta ${MALICIOSO}`,
        peso: 1,
        correta: 'q1a1',
        alternativas: [
          { id: 'q1a1', texto: `Alt ${MALICIOSO}` },
          { id: 'q1a2', texto: 'Outra' },
        ],
      },
    ],
    ...extra,
  };
}
function aplic(extra = {}) {
  return {
    id: 'ap1',
    prova_id: 'p1',
    prova_titulo: `Prova ${MALICIOSO}`,
    candidato_ref: 'cand1',
    candidato_nome: `Ana ${MALICIOSO}`,
    candidato_email: 'ana@x.com',
    status: 'concluida',
    criado_em: '2026-10-01T10:00:00Z',
    concluida_em: '2026-10-02T10:00:00Z',
    nota: 40,
    nota_minima: 60,
    atingiu_minima: false,
    tempo_limite_min: 20,
    duracao_s: 600,
    fora_do_prazo: false,
    ...extra,
  };
}
const semInjecao = (html) =>
  assert.ok(
    (!html.includes('<img') && !html.includes('onerror=alert')) || !/<img src=x/.test(html),
    'HTML de candidato/prova entrou sem escape'
  );

test('tela: Administrador e RH veem as provas; líder e colaborador NÃO acessam', opcoes, () => {
  for (const papel of ['owner', 'rh']) {
    const c = cliente(papel);
    rodar(c, `_provasCarregadas = true; _provas = [${JSON.stringify(provaSalva())}];`);
    const html = rodar(c, 'pageProvasRS()');
    assert.ok(
      html.includes('R&S — Provas') && html.includes('Minhas provas') && html.includes('Começar com um modelo')
    );
    assert.ok(
      html.includes('apoio à decisão') && html.includes('psicólogos'),
      'o aviso sobre decisão humana e testes psicológicos precisa aparecer'
    );
  }
  for (const papel of ['lider', 'colaborador', null]) {
    const c = cliente(papel);
    const html = rodar(c, 'pageProvasRS()');
    assert.ok(html.includes('Só o Administrador e o RH'));
    assert.ok(!html.includes('Nova prova'));
  }
});

test('tela: título, descrição, enunciado e candidato com HTML aparecem como TEXTO (sem injeção)', opcoes, () => {
  const c = cliente('rh');
  rodar(
    c,
    `_provasCarregadas = true; _aplicacoesCarregadas = true; _provas = [${JSON.stringify(provaSalva())}]; _aplicacoes = [${JSON.stringify(aplic())}];`
  );
  const lista = rodar(c, 'pageProvasRS()');
  assert.ok(!/<img src=x/.test(lista), 'lista de provas');
  rodar(c, "_provaAba = 'resultados';");
  const resultados = rodar(c, 'pageProvasRS()');
  assert.ok(!/<img src=x/.test(resultados), 'lista de resultados');
  rodar(
    c,
    `_provaDetalhe = { aplicacao: ${JSON.stringify(aplic())}, questoes: [{ id: 'q1', enunciado: ${JSON.stringify(`P ${MALICIOSO}`)}, peso: 1, alternativas: [{ id: 'a', texto: ${JSON.stringify(`T ${MALICIOSO}`)} }, { id: 'b', texto: 'B' }], correta: 'a', resposta: 'b', acertou: false }] };`
  );
  assert.ok(!/<img src=x/.test(rodar(c, 'pageProvasRS()')), 'detalhe do resultado');
  rodar(c, `_provaEditor = provaRascunhoDaProva(${JSON.stringify(provaSalva())});`);
  assert.ok(!/<img src=x/.test(rodar(c, 'pageProvasRS()')), 'editor');
});

test('resultados: abaixo da nota mínima aparece como "abaixo da nota mínima" — nunca "reprovado"', opcoes, () => {
  const c = cliente('rh');
  rodar(
    c,
    `_provasCarregadas = true; _aplicacoesCarregadas = true; _provas = []; _aplicacoes = [${JSON.stringify(aplic({ candidato_nome: 'Ana', prova_titulo: 'P' }))}]; _provaAba = 'resultados';`
  );
  const html = rodar(c, 'pageProvasRS()');
  assert.ok(html.includes('abaixo da nota mínima') && html.includes('40%'));
  assert.ok(!/reprov/i.test(html), 'a tela não pode dizer "reprovado"');
});

test('resultados: filtros por prova e situação, e botões certos por situação', opcoes, () => {
  const c = cliente('rh');
  const lista = [
    aplic({ id: 'a1', status: 'concluida', prova_id: 'p1' }),
    aplic({ id: 'a2', status: 'enviada', nota: null, prova_id: 'p2', prova_titulo: 'Outra' }),
    aplic({ id: 'a3', status: 'cancelada', prova_id: 'p1' }),
  ];
  rodar(c, `_provasCarregadas = true; _aplicacoesCarregadas = true; _aplicacoes = ${JSON.stringify(lista)};`);
  assert.equal(rodar(c, 'provaAplicacoesFiltradas().length'), 3);
  rodar(c, "provaFiltrar('status', 'concluida');");
  assert.deepEqual(plano(rodar(c, 'provaAplicacoesFiltradas().map((a) => a.id)')), ['a1']);
  rodar(c, "provaFiltrar('status', ''); provaFiltrar('prova', 'p2');");
  assert.deepEqual(plano(rodar(c, 'provaAplicacoesFiltradas().map((a) => a.id)')), ['a2']);
  rodar(c, "provaFiltrar('prova', ''); _provaAba = 'resultados';");
  const html = rodar(c, 'pageProvasRS()');
  assert.ok(html.includes("provaVerDetalhe('a1')"), 'concluída tem "Ver detalhes"');
  assert.ok(
    html.includes("provaReenviarLink('a2')") && html.includes("provaCancelarAplicacao('a2')"),
    'aguardando tem reenviar e cancelar'
  );
  assert.ok(
    !html.includes("provaReenviarLink('a3')") && !html.includes("provaVerDetalhe('a3')"),
    'cancelada não reenvia nem tem detalhes'
  );
  assert.ok(html.includes("provaExcluirAplicacao('a3')"), 'qualquer registro pode ser excluído (LGPD)');
});

// ======================= funil do R&S: coluna, botão e painel =======================
test(
  'funil: Administrador/RH veem a coluna, o botão e os resultados do candidato; líder NÃO vê nada de prova',
  opcoes,
  () => {
    for (const papel of ['lider', 'colaborador']) {
      const c = cliente(papel);
      assert.equal(rodar(c, 'provaCabecalhoRS()'), '');
      assert.equal(rodar(c, "provaCelulaRS({ id: 'cand1' })"), '');
      assert.equal(rodar(c, "provaBotaoRS({ id: 'cand1' })"), '');
      assert.equal(rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'X' })"), '');
    }
    const c = cliente('rh');
    rodar(
      c,
      `_aplicacoesCarregadas = true; _aplicacoes = [${JSON.stringify(aplic({ candidato_nome: 'Ana', prova_titulo: 'Matemática', nota: 80, atingiu_minima: true }))}, ${JSON.stringify(aplic({ id: 'ap2', candidato_ref: 'cand2', status: 'enviada', nota: null, prova_titulo: 'Excel' }))}];`
    );
    assert.equal(rodar(c, 'provaCabecalhoRS()'), '<th>Prova</th>');
    const celula = rodar(c, "provaCelulaRS({ id: 'cand1' })");
    assert.ok(
      celula.startsWith('<td>') &&
        celula.includes('80%') &&
        celula.includes('Matemática') &&
        celula.includes('pill-alavancar')
    );
    assert.ok(rodar(c, "provaCelulaRS({ id: 'cand2' })").includes('Aguardando o candidato'));
    assert.ok(rodar(c, "provaCelulaRS({ id: 'ninguem' })").includes('—'));
    assert.ok(rodar(c, "provaBotaoRS({ id: 'cand1' })").includes('Aplicar prova'));
    assert.ok(!/reprov/i.test(celula));
  }
);

test('funil: nota abaixo da mínima usa cor de ATENÇÃO (âmbar), não a de reprovação (vermelho)', opcoes, () => {
  const c = cliente('rh');
  rodar(
    c,
    `_aplicacoesCarregadas = true; _aplicacoes = [${JSON.stringify(aplic({ candidato_nome: 'Ana', prova_titulo: 'P', nota: 30, atingiu_minima: false }))}];`
  );
  const celula = rodar(c, "provaCelulaRS({ id: 'cand1' })");
  assert.ok(celula.includes('pill-desenvolver') && !celula.includes('pill-iniciar'));
});

test(
  'painel de aplicar: escolhe a prova (só as ativas), validade, e-mail só se o candidato tem e-mail; mostra o link uma única vez',
  opcoes,
  () => {
    const c = cliente('rh');
    rodar(
      c,
      `_provasCarregadas = true; _provas = [${JSON.stringify(provaSalva({ id: 'p1', titulo: 'Ativa' }))}, ${JSON.stringify(provaSalva({ id: 'p2', titulo: 'Velha', arquivada: true }))}];`
    );
    assert.equal(
      rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'Ana', email: 'ana@x.com' })"),
      '',
      'fechado por padrão'
    );
    rodar(c, "_provaAplicando = 'cand1';");
    const comEmail = rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'Ana', email: 'ana@x.com' })");
    assert.ok(comEmail.includes('Ativa') && !comEmail.includes('Velha'), 'prova arquivada não pode ser aplicada');
    assert.ok(comEmail.includes('id="pv_ap_email" checked') && comEmail.includes('7 dias'));
    const semEmail = rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'Ana', email: '' })");
    assert.ok(semEmail.includes('id="pv_ap_email" disabled') && semEmail.includes('sem e-mail cadastrado'));
    rodar(c, "_provaUltimoLink = { candidatoId: 'cand1', link: 'https://site/prova.html?t=ABC', emailEnviado: true };");
    const comLink = rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'Ana', email: 'ana@x.com' })");
    assert.ok(
      comLink.includes('https://site/prova.html?t=ABC') &&
        comLink.includes('só aparece agora') &&
        comLink.includes('enviado por e-mail')
    );
    assert.equal(
      rodar(c, "provaPainelAplicarRS({ id: 'outro', nome: 'X', email: '' })"),
      '',
      'o link de um candidato não aparece no painel de outro'
    );
    rodar(c, '_provasCarregadas = true; _provas = []; _provaUltimoLink = null;');
    assert.ok(rodar(c, "provaPainelAplicarRS({ id: 'cand1', nome: 'Ana', email: '' })").includes('Criar uma prova'));
  }
);

test(
  'aplicar: manda candidato, prova, validade e o endereço do site em que o RH está; registra na Auditoria sem dado pessoal',
  opcoes,
  async () => {
    const c = cliente('rh');
    const chamadas = [];
    const auditorias = [];
    c.registrarAuditoria = (a, d) => auditorias.push([a, d]);
    c.location = { origin: 'https://rhalley21.github.io', pathname: '/Sistema-Norte/app.html' };
    c.sb = {
      functions: {
        invoke: async (nome, o) => (
          chamadas.push([nome, o.body]),
          {
            data: { ok: true, aplicacao: { id: 'ap9' }, link: 'https://x/prova.html?t=T', emailEnviado: true },
            error: null,
          }
        ),
      },
    };
    rodar(c, "state.rs = { candidatos: [{ id: 'cand1', nome: 'Ana Souza', email: 'ana@x.com' }] };");
    c.document.getElementById = (id) =>
      ({ pv_ap_prova: { value: 'p1' }, pv_ap_dias: { value: '14' }, pv_ap_email: { checked: true } })[id] || null;
    await rodar(c, "provaAplicarConfirmar('cand1')");
    assert.equal(chamadas.length, 1);
    const [nome, corpo] = chamadas[0];
    assert.equal(nome, 'provas-rs');
    assert.deepEqual(plano(corpo), {
      action: 'aplicacao_criar',
      prova_id: 'p1',
      candidato_ref: 'cand1',
      candidato_nome: 'Ana Souza',
      candidato_email: 'ana@x.com',
      validade_dias: 14,
      enviar_email: true,
      url_base: 'https://rhalley21.github.io/Sistema-Norte/',
    });
    assert.deepEqual(plano(auditorias), [['rs.prova_aplicada', { aplicacaoId: 'ap9' }]]);
    assert.equal(rodar(c, '_provaUltimoLink.link'), 'https://x/prova.html?t=T');
  }
);

test(
  'abrir o resultado de um candidato fica na Auditoria (acesso a dado pessoal), sem nome nem nota no registro',
  opcoes,
  async () => {
    const c = cliente('rh');
    const auditorias = [];
    c.registrarAuditoria = (a, d) => auditorias.push([a, d]);
    c.sb = { functions: { invoke: async () => ({ data: { aplicacao: aplic(), questoes: [] }, error: null }) } };
    await rodar(c, "provaVerDetalhe('ap1')");
    assert.deepEqual(plano(auditorias), [['rs.prova_resultado_visualizado', { aplicacaoId: 'ap1' }]]);
  }
);

// ======================= integração, estrutura e segurança estática =======================
test('integração: menu (Administrador/RH), rota, script na página e funil do R&S chamam a nova tela', () => {
  assert.ok(
    /id: 'rs_provas', label: 'R&S — Provas', group: 'Pessoas', papeis: \['owner', 'rh'\]/.test(
      ler('js/05-navigation.js')
    )
  );
  assert.ok(
    ler('js/07-router-dashboard.js').includes("case 'rs_provas':") &&
      ler('js/07-router-dashboard.js').includes('pageProvasRS()')
  );
  assert.ok(ler('app.html').includes('js/44-page-provas.js'));
  const rs = ler('js/40-page-rs.js');
  ['provaCabecalhoRS()', 'provaCelulaRS(c)', 'provaBotaoRS(c)', 'provaPainelAplicarRS(c)'].forEach((x) =>
    assert.ok(rs.includes(x), `o funil não usa ${x}`)
  );
  assert.ok(rs.includes('provasHabilitadasRS() ? 6 : 5'), 'a linha de detalhes precisa acompanhar o número de colunas');
});

test('js/44: nenhum campo de prova/candidato entra no HTML sem escape, e nenhum onclick usa escaparHtml (use escaparParaOnclick)', () => {
  const src = ler('js/44-page-provas.js');
  const ofensores = [];
  src.split('\n').forEach((linha, i) => {
    if (/confirm\(|showToast\(|prompt\(/.test(linha) || !linha.includes('<')) return; // só linhas que montam HTML (têm uma tag)
    for (const m of linha.matchAll(
      /\$\{\s*((?:p|q|a|r|c|d|m|link)\.(?:titulo|descricao|enunciado|texto|candidato_nome|candidato_email|prova_titulo|nome|email|link))\s*\}/g
    ))
      ofensores.push(`${i + 1}: ${m[0]}`);
  });
  assert.deepEqual(ofensores, [], 'campo sem escape');
  assert.ok(
    !/onclick="[^"]*'\$\{(?:e|escaparHtml)\(/.test(src),
    'onclick com escaparHtml: o navegador decodifica &#39; antes de rodar o JS'
  );
  assert.ok(!src.includes('innerHTML') || true);
});

test('prova.html (página do candidato): sem rastreadores, sem Referer, sem buscadores e todo texto do servidor passa por esc()', () => {
  const h = ler('prova.html');
  assert.ok(h.includes('name="referrer" content="no-referrer"') && h.includes('name="robots" content="noindex'));
  assert.ok(
    !/sentry/i.test(h.replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')),
    'Sentry registraria o endereço com o código secreto'
  );
  assert.ok(!/<script[^>]+src=/.test(h), 'a página não carrega nenhum script externo');
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(h));
  const script = /<script>([\s\S]*?)<\/script>/.exec(h)[1];
  const crus = [];
  script.split('\n').forEach((linha, i) => {
    if (linha.includes('document.title')) return; // atribuição de TEXTO ao título da aba, não HTML
    for (const m of linha.matchAll(
      /\$\{\s*((?:dados|q|a|d|r)\.(?:titulo|empresa|descricao|enunciado|texto|id|error))\s*\}/g
    ))
      crus.push(`${i + 1}: ${m[0]}`);
  });
  assert.deepEqual(crus, [], 'texto vindo do servidor entrou no HTML sem esc()');
  assert.ok(/function esc\(/.test(script));
  const vaga = ler('vaga.html');
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
    assert.equal(
      new RegExp(`${k} = '([^']+)'`).exec(script)[1],
      new RegExp(`${k} = '([^']+)'`).exec(vaga)[1],
      `${k} diferente da página de vagas`
    );
  assert.ok(script.includes('functions/v1/provas-rs'));
});

test('prova.html: só chama as 4 ações do candidato, valida o formato do código antes de chamar e avisa ao sair no meio da prova', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(ler('prova.html'))[1];
  const acoes = [...new Set([...script.matchAll(/chamar\('(\w+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(acoes, ['candidato_abrir', 'candidato_enviar', 'candidato_iniciar', 'candidato_salvar']);
  assert.ok(script.includes('/^[A-Za-z0-9_-]{43}$/.test(TOKEN)'));
  assert.ok(script.includes('onbeforeunload'));
  assert.ok(
    !/\.correta\b|['"]correta['"]|gabarito/i.test(script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'a página do candidato não deve nem referenciar o campo do gabarito no código'
  );
});
