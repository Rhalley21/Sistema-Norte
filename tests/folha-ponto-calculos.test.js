// =========================================================================
// Testa os cálculos da folha de ponto em papel (js/42-page-folha-papel.js):
// horas trabalhadas, atraso, hora extra, faltas e pendências. Esses números
// viram pagamento/desconto de verdade — um erro silencioso aqui é dinheiro
// errado no contracheque de alguém.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const ctx = carregarArquivos(['js/42-page-folha-papel.js']);
const plano = (x) => JSON.parse(JSON.stringify(x)); // objetos do vm têm outro prototype

const JORNADA = { entrada: '08:00', saida: '17:00', almocoInicio: '12:00', almocoFim: '13:00', toleranciaMin: 10 };
const SETEMBRO = '2026-09'; // 1º de setembro de 2026 é uma terça-feira; 30 dias

test('folhaMinutos: converte horários válidos e recusa o resto', () => {
  assert.equal(ctx.folhaMinutos('08:30'), 510);
  assert.equal(ctx.folhaMinutos('8:05'), 485);
  assert.equal(ctx.folhaMinutos('00:00'), 0);
  assert.equal(ctx.folhaMinutos('23:59'), 1439);
  assert.equal(ctx.folhaMinutos('24:00'), null);
  assert.equal(ctx.folhaMinutos('12:60'), null);
  assert.equal(ctx.folhaMinutos(''), null);
  assert.equal(ctx.folhaMinutos(null), null);
  assert.equal(ctx.folhaMinutos('abc'), null);
});

test('folhaFormatarDuracao: formata horas e minutos, com e sem sinal', () => {
  assert.equal(ctx.folhaFormatarDuracao(485), '8h05');
  assert.equal(ctx.folhaFormatarDuracao(0), '0h00');
  assert.equal(ctx.folhaFormatarDuracao(22, true), '+0h22');
  assert.equal(ctx.folhaFormatarDuracao(-22, true), '-0h22');
  assert.equal(ctx.folhaFormatarDuracao(0, true), '0h00');
  assert.equal(ctx.folhaFormatarDuracao(-65), '-1h05');
});

test('folhaDiasDoMes e dia útil: setembro/2026 tem 30 dias e dia 1 é terça', () => {
  assert.equal(ctx.folhaDiasDoMes('2026-09'), 30);
  assert.equal(ctx.folhaDiasDoMes('2026-02'), 28);
  assert.equal(ctx.folhaDiasDoMes('2024-02'), 29);
  assert.equal(ctx.folhaDiaDaSemana('2026-09', 1), 2); // terça
  assert.equal(ctx.folhaEhDiaUtil('2026-09', 1), true);
  assert.equal(ctx.folhaEhDiaUtil('2026-09', 5), false); // sábado
  assert.equal(ctx.folhaEhDiaUtil('2026-09', 6), false); // domingo
});

test('folhaMinutosTrabalhados: dia clássico com almoço (4 marcações)', () => {
  const r = plano(ctx.folhaMinutosTrabalhados(['08:00', '12:00', '13:00', '17:00']));
  assert.equal(r.minutos, 8 * 60); // 4h + 4h
  assert.equal(r.completo, true);
  assert.equal(r.suspeito, false);
});

test('folhaMinutosTrabalhados: jornada contínua com 2 marcações', () => {
  assert.equal(plano(ctx.folhaMinutosTrabalhados(['08:00', '14:00'])).minutos, 6 * 60);
});

test('folhaMinutosTrabalhados: marcação sem par é incompleta e só conta os pares fechados', () => {
  const r = plano(ctx.folhaMinutosTrabalhados(['08:00', '12:00', '13:00']));
  assert.equal(r.minutos, 4 * 60);
  assert.equal(r.completo, false);
});

test('folhaMinutosTrabalhados: ignora lixo e vazios no meio da lista', () => {
  const r = plano(ctx.folhaMinutosTrabalhados(['08:00', '', 'xx', '12:00']));
  assert.equal(r.minutos, 4 * 60);
  assert.equal(r.completo, true);
});

test('folhaMinutosTrabalhados: turno noturno atravessando a meia-noite', () => {
  const r = plano(ctx.folhaMinutosTrabalhados(['22:00', '06:00']));
  assert.equal(r.minutos, 8 * 60);
  assert.equal(r.atravessa, true);
});

test('folhaMinutosTrabalhados: período maior que 16h é marcado como suspeito (provável erro de leitura)', () => {
  assert.equal(plano(ctx.folhaMinutosTrabalhados(['08:00', '03:00'])).suspeito, true); // leu 03:00 em vez de 13:00?
  assert.equal(plano(ctx.folhaMinutosTrabalhados(['08:00', '17:00'])).suspeito, false);
});

test('folhaMinutosTrabalhados: sem marcações não é "completo"', () => {
  const r = plano(ctx.folhaMinutosTrabalhados([]));
  assert.equal(r.minutos, 0);
  assert.equal(r.completo, false);
});

// ---- folhaResumo ----

const diaNormal = (dia) => ({ dia, marcacoes: ['08:00', '12:00', '13:00', '17:00'], tipo: 'trabalhado' });

test('folhaResumo: mês sem nenhum registro — tudo zerado, dias úteis viram "sem registro"', () => {
  const r = plano(ctx.folhaResumo([], JORNADA, SETEMBRO));
  assert.equal(r.diasTrabalhados, 0);
  assert.equal(r.minutosTrabalhados, 0);
  assert.equal(r.faltas, 0);
  // setembro/2026: 22 dias úteis (30 dias, 4 sábados e 4 domingos).
  assert.equal(r.semRegistro.length, 22);
});

test('folhaResumo: três dias normais somam 24h, sem atraso nem extra', () => {
  const r = plano(ctx.folhaResumo([diaNormal(1), diaNormal(2), diaNormal(3)], JORNADA, SETEMBRO));
  assert.equal(r.diasTrabalhados, 3);
  assert.equal(r.minutosTrabalhados, 24 * 60);
  assert.equal(r.atrasoMin, 0);
  assert.equal(r.extraMin, 0);
  assert.equal(r.saldoMin, 0);
});

test('folhaResumo: tolerância de 10 min — chegar 08:10 não é atraso; 08:20 são 10 min de atraso', () => {
  const dentro = plano(
    ctx.folhaResumo([{ dia: 1, marcacoes: ['08:10', '12:00', '13:00', '17:00'] }], JORNADA, SETEMBRO)
  );
  assert.equal(dentro.atrasoMin, 0);
  const fora = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['08:20', '12:00', '13:00', '17:00'] }], JORNADA, SETEMBRO));
  assert.equal(fora.atrasoMin, 10); // 20 min depois da entrada − 10 de tolerância
});

test('folhaResumo: hora extra só depois da saída prevista + tolerância', () => {
  const sem = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['08:00', '12:00', '13:00', '17:10'] }], JORNADA, SETEMBRO));
  assert.equal(sem.extraMin, 0);
  const com = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['08:00', '12:00', '13:00', '18:00'] }], JORNADA, SETEMBRO));
  assert.equal(com.extraMin, 50); // 60 min depois − 10 de tolerância
});

test('folhaResumo: saldo = extras − atrasos (mesma regra do ponto eletrônico)', () => {
  const dias = [
    { dia: 1, marcacoes: ['08:30', '12:00', '13:00', '17:00'] }, // atraso: 30 − 10 = 20
    { dia: 2, marcacoes: ['08:00', '12:00', '13:00', '18:30'] }, // extra: 90 − 10 = 80
  ];
  const r = plano(ctx.folhaResumo(dias, JORNADA, SETEMBRO));
  assert.equal(r.atrasoMin, 20);
  assert.equal(r.extraMin, 80);
  assert.equal(r.saldoMin, 60);
});

test('folhaResumo: falta conta como falta; folga, atestado, feriado e férias são abonados', () => {
  const dias = [
    { dia: 1, tipo: 'falta', marcacoes: [] },
    { dia: 2, tipo: 'atestado', marcacoes: [] },
    { dia: 3, tipo: 'feriado', marcacoes: [] },
    { dia: 4, tipo: 'ferias', marcacoes: [] },
    { dia: 5, tipo: 'folga', marcacoes: [] },
  ];
  const r = plano(ctx.folhaResumo(dias, JORNADA, SETEMBRO));
  assert.equal(r.faltas, 1);
  assert.equal(r.abonados, 4);
  assert.ok(!r.semRegistro.includes(1) && !r.semRegistro.includes(2), 'dia marcado não pode virar "sem registro"');
});

test('folhaResumo: fim de semana sem marcação NÃO vira "sem registro"', () => {
  const r = plano(ctx.folhaResumo([], JORNADA, SETEMBRO));
  assert.ok(!r.semRegistro.includes(5) && !r.semRegistro.includes(6)); // sáb e dom
});

test('folhaResumo: sábado trabalhado entra nas horas', () => {
  const r = plano(ctx.folhaResumo([{ dia: 5, marcacoes: ['08:00', '12:00'] }], JORNADA, SETEMBRO));
  assert.equal(r.diasTrabalhados, 1);
  assert.equal(r.minutosTrabalhados, 4 * 60);
});

test('folhaResumo: dia incompleto é listado e não gera hora extra', () => {
  const r = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['08:00', '12:00', '13:00'] }], JORNADA, SETEMBRO));
  assert.deepEqual(r.incompletos, [1]);
  assert.equal(r.extraMin, 0);
  assert.equal(r.minutosTrabalhados, 4 * 60);
});

test('folhaResumo: turno noturno não gera atraso/extra falsos, mas conta as horas', () => {
  const r = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['22:00', '06:00'] }], JORNADA, SETEMBRO));
  assert.equal(r.minutosTrabalhados, 8 * 60);
  assert.equal(r.atrasoMin, 0);
  assert.equal(r.extraMin, 0);
});

test('folhaResumo: sem jornada definida não quebra e não inventa atraso/extra', () => {
  const r = plano(ctx.folhaResumo([diaNormal(1)], undefined, SETEMBRO));
  assert.equal(r.minutosTrabalhados, 8 * 60);
  assert.equal(r.atrasoMin, 0);
  assert.equal(r.extraMin, 0);
});

test('folhaResumo: ignora dias fora do mês e entradas inválidas na lista', () => {
  const r = plano(
    ctx.folhaResumo(
      [null, undefined, { dia: 0 }, { dia: 31, marcacoes: ['08:00', '17:00'] }, diaNormal(2)],
      JORNADA,
      SETEMBRO
    )
  );
  assert.equal(r.diasTrabalhados, 1); // setembro não tem dia 31
});

test('folhaResumo: período suspeito (>16h) é sinalizado', () => {
  const r = plano(ctx.folhaResumo([{ dia: 1, marcacoes: ['08:00', '03:00'] }], JORNADA, SETEMBRO));
  assert.deepEqual(r.suspeitos, [1]);
});

// ---- Checagens de nome e mês ----

test('folhaNomeCompativel: aceita nome parcial/com acento, recusa nome de outra pessoa', () => {
  assert.equal(ctx.folhaNomeCompativel('Maria Souza', 'Maria Aparecida Souza'), true);
  assert.equal(ctx.folhaNomeCompativel('MARIA S.', 'Maria Souza'), true);
  assert.equal(ctx.folhaNomeCompativel('José Antônio', 'Jose Antonio Lima'), true);
  assert.equal(ctx.folhaNomeCompativel('Carlos Pereira', 'Maria Souza'), false);
});

test('folhaNomeCompativel: sem informação suficiente, não reclama', () => {
  assert.equal(ctx.folhaNomeCompativel(null, 'Maria'), true);
  assert.equal(ctx.folhaNomeCompativel('', 'Maria'), true);
  assert.equal(ctx.folhaNomeCompativel('Maria', ''), true);
  assert.equal(ctx.folhaNomeCompativel('??', 'Maria'), true);
});

test('folhaMesCompativel: entende vários formatos de mês escritos à mão', () => {
  assert.equal(ctx.folhaMesCompativel('09/2026', '2026-09'), true);
  assert.equal(ctx.folhaMesCompativel('9-26', '2026-09'), true);
  assert.equal(ctx.folhaMesCompativel('09.2026', '2026-09'), true);
  assert.equal(ctx.folhaMesCompativel('08/2026', '2026-09'), false);
  assert.equal(ctx.folhaMesCompativel('09/2025', '2026-09'), false);
});

test('folhaMesCompativel: texto sem mês reconhecível não reclama', () => {
  assert.equal(ctx.folhaMesCompativel(null, '2026-09'), true);
  assert.equal(ctx.folhaMesCompativel('setembro', '2026-09'), true);
});

// ---- Lista de presença do dia: casar nomes, juntar horários, aplicar o dia ----

const EQUIPE = [
  { id: 'c1', nome: 'Maria Aparecida Souza' },
  { id: 'c2', nome: 'Maria Silva' },
  { id: 'c3', nome: 'João Pedro Lima' },
  { id: 'c4', nome: 'Fernanda Albuquerque' },
  { id: 'c5', nome: 'Mario Santos' },
  { id: 'c6', nome: 'José Antônio de Oliveira' },
];

test('folhaCasarNome: nome completo bate exato, ignorando acento e maiúsculas', () => {
  const r = plano(ctx.folhaCasarNome('JOAO PEDRO LIMA', EQUIPE));
  assert.equal(r.id, 'c3');
  assert.equal(r.nivel, 'exato');
});

test('folhaCasarNome: ignora "de/da/do" e aceita nome parcial único como provável', () => {
  assert.equal(plano(ctx.folhaCasarNome('Jose Antonio Oliveira', EQUIPE)).id, 'c6');
  const r = plano(ctx.folhaCasarNome('Fernanda', EQUIPE));
  assert.equal(r.id, 'c4');
  assert.equal(r.nivel, 'provavel');
});

test('folhaCasarNome: só "Maria" com duas Marias é AMBÍGUO — não sugere ninguém', () => {
  const r = plano(ctx.folhaCasarNome('Maria', EQUIPE));
  assert.equal(r.id, null);
  assert.equal(r.nivel, 'ambiguo');
  assert.deepEqual(r.candidatos.map((c) => c.id).sort(), ['c1', 'c2']);
});

test('folhaCasarNome: "Maria S." com inicial desempata só quando só uma bate', () => {
  // S = Souza (c1) e S = Silva (c2): as duas batem -> ambíguo
  assert.equal(plano(ctx.folhaCasarNome('Maria S.', EQUIPE)).nivel, 'ambiguo');
  // "Maria So" não é inicial (2 letras) e não é igual -> só "maria" bate nas duas
  assert.equal(plano(ctx.folhaCasarNome('Maria Souza', EQUIPE)).id, 'c1');
});

test('folhaCasarNome: "Mario" NÃO vira "Maria" (nome curto exige igualdade)', () => {
  const r = plano(ctx.folhaCasarNome('Mario Santos', EQUIPE));
  assert.equal(r.id, 'c5');
  const so = plano(ctx.folhaCasarNome('Mario', EQUIPE));
  assert.equal(so.id, 'c5'); // só Mario Santos tem "mario"
});

test('folhaCasarNome: nome longo com uma letra errada ainda casa (letra de mão)', () => {
  const r = plano(ctx.folhaCasarNome('Fernando Albuquerqui', EQUIPE));
  assert.equal(r.id, 'c4'); // "albuquerqui" ~ "albuquerque"
});

test('folhaCasarNome: nome que ninguém tem, vazio ou lixo → nenhum', () => {
  assert.equal(plano(ctx.folhaCasarNome('Roberto Carlos', EQUIPE)).nivel, 'nenhum');
  assert.equal(plano(ctx.folhaCasarNome('', EQUIPE)).nivel, 'nenhum');
  assert.equal(plano(ctx.folhaCasarNome('???', EQUIPE)).nivel, 'nenhum');
  assert.equal(plano(ctx.folhaCasarNome('Maria', [])).nivel, 'nenhum');
});

test('folhaCasarNome: nome completo único vence nome mais longo parecido', () => {
  const equipe = [
    { id: 'a', nome: 'Ana Lima' },
    { id: 'b', nome: 'Ana Lima Costa' },
  ];
  const r = plano(ctx.folhaCasarNome('Ana Lima', equipe));
  assert.equal(r.id, 'a');
  assert.equal(r.nivel, 'exato');
});

test('folhaCasarNome: dois cadastros com o mesmo nome → ambíguo', () => {
  const equipe = [
    { id: 'a', nome: 'Ana Lima' },
    { id: 'b', nome: 'Ana Lima' },
  ];
  assert.equal(plano(ctx.folhaCasarNome('Ana Lima', equipe)).nivel, 'ambiguo');
});

test('folhaDistancia: conta trocas, inserções e remoções', () => {
  assert.equal(ctx.folhaDistancia('casa', 'casa'), 0);
  assert.equal(ctx.folhaDistancia('casa', 'cassa'), 1);
  assert.equal(ctx.folhaDistancia('maria', 'mario'), 1);
  assert.equal(ctx.folhaDistancia('', 'abc'), 3);
});

test('folhaMesclarMarcacoes: junta, tira repetidos, descarta inválidos e ordena pelo relógio', () => {
  assert.deepEqual(plano(ctx.folhaMesclarMarcacoes(['12:00', '08:00'], ['08:00', '13:01', 'xx', '', '17:05'])), [
    '08:00',
    '12:00',
    '13:01',
    '17:05',
  ]);
  assert.deepEqual(plano(ctx.folhaMesclarMarcacoes(['8:05'], [])), ['08:05']);
  assert.deepEqual(plano(ctx.folhaMesclarMarcacoes(null, undefined)), []);
});

test('folhaAplicarDia: dia novo entra na lista e a lista fica em ordem de dia', () => {
  const dias = [{ dia: 5, marcacoes: ['08:00', '17:00'], tipo: 'trabalhado', observacao: '', confianca: 'alta' }];
  const r = plano(ctx.folhaAplicarDia(dias, { dia: 2, marcacoes: ['17:00', '08:00'] }, 'somar'));
  assert.deepEqual(
    r.map((d) => d.dia),
    [2, 5]
  );
  assert.deepEqual(r[0].marcacoes, ['08:00', '17:00']);
  assert.equal(r[0].tipo, 'trabalhado');
});

test('folhaAplicarDia: "somar" junta com o que o dia já tinha; "substituir" troca', () => {
  const dias = [{ dia: 3, marcacoes: ['08:00', '12:00'], tipo: 'trabalhado', observacao: 'ok', confianca: 'alta' }];
  const somado = plano(ctx.folhaAplicarDia(dias, { dia: 3, marcacoes: ['13:00', '17:00'] }, 'somar'));
  assert.deepEqual(somado[0].marcacoes, ['08:00', '12:00', '13:00', '17:00']);
  assert.equal(somado[0].observacao, 'ok'); // mantém a observação existente se a nova vier vazia
  const trocado = plano(ctx.folhaAplicarDia(dias, { dia: 3, marcacoes: ['09:00', '18:00'] }, 'substituir'));
  assert.deepEqual(trocado[0].marcacoes, ['09:00', '18:00']);
});

test('folhaAplicarDia: importar a MESMA foto duas vezes não duplica horário', () => {
  const novo = { dia: 3, marcacoes: ['08:00', '12:00', '13:00', '17:00'] };
  const uma = ctx.folhaAplicarDia([], novo, 'somar');
  const duas = plano(ctx.folhaAplicarDia(uma, novo, 'somar'));
  assert.deepEqual(duas[0].marcacoes, ['08:00', '12:00', '13:00', '17:00']);
});

test('folhaAplicarDia: não altera a lista original e não mexe em outros dias', () => {
  const dias = [
    { dia: 1, marcacoes: ['08:00', '17:00'], tipo: 'trabalhado', observacao: '', confianca: 'alta' },
    { dia: 2, marcacoes: [], tipo: 'falta', observacao: '', confianca: 'alta' },
  ];
  const copia = plano(dias);
  const r = plano(ctx.folhaAplicarDia(dias, { dia: 3, marcacoes: ['08:00', '17:00'] }, 'somar'));
  assert.deepEqual(plano(dias), copia);
  assert.equal(r.find((d) => d.dia === 2).tipo, 'falta');
  assert.deepEqual(r.find((d) => d.dia === 1).marcacoes, ['08:00', '17:00']);
});

test('folhaAplicarDia: dia que era "falta" vira trabalhado quando chegam horários', () => {
  const dias = [{ dia: 4, marcacoes: [], tipo: 'falta', observacao: '', confianca: 'alta' }];
  const r = plano(ctx.folhaAplicarDia(dias, { dia: 4, marcacoes: ['08:00', '17:00'] }, 'substituir'));
  assert.equal(r[0].tipo, 'trabalhado');
});

test('folhaAplicarDia: somar mantém a PIOR confiança (a dúvida não some sozinha)', () => {
  const dias = [{ dia: 6, marcacoes: ['08:00'], tipo: 'trabalhado', observacao: '', confianca: 'baixa' }];
  const r = plano(ctx.folhaAplicarDia(dias, { dia: 6, marcacoes: ['17:00'], confianca: 'alta' }, 'somar'));
  assert.equal(r[0].confianca, 'baixa');
});

test('folhaListaDiaSituacao: novo, já tem horários, ou bloqueado (folha confirmada)', () => {
  assert.equal(plano(ctx.folhaListaDiaSituacao(null, 3)).tipo, 'novo');
  const rascunho = { status: 'rascunho', dias: [{ dia: 3, marcacoes: ['08:00', '12:00'] }] };
  const s1 = plano(ctx.folhaListaDiaSituacao(rascunho, 3));
  assert.equal(s1.tipo, 'existente');
  assert.deepEqual(s1.atuais, ['08:00', '12:00']);
  assert.equal(plano(ctx.folhaListaDiaSituacao(rascunho, 4)).tipo, 'novo'); // outro dia, ainda vazio
  assert.equal(plano(ctx.folhaListaDiaSituacao({ status: 'confirmada', dias: [] }, 3)).tipo, 'bloqueado');
});

test('folhaDataValida: só datas que existem no calendário', () => {
  assert.equal(ctx.folhaDataValida('2026-09-10'), true);
  assert.equal(ctx.folhaDataValida('2024-02-29'), true);
  assert.equal(ctx.folhaDataValida('2026-02-29'), false);
  assert.equal(ctx.folhaDataValida('2026-09-31'), false);
  assert.equal(ctx.folhaDataValida('10/09/2026'), false);
  assert.equal(ctx.folhaDataValida(''), false);
  assert.equal(ctx.folhaDataValida(null), false);
});

test('folhaCasarNome: letra aproximada ou inicial NUNCA conta como "exato" — no máximo "provável"', () => {
  const fuzzy = plano(ctx.folhaCasarNome('Fernando Albuquerqui', EQUIPE));
  assert.equal(fuzzy.id, 'c4');
  assert.equal(fuzzy.nivel, 'provavel');
  const unico = [
    { id: 'x', nome: 'Maria Souza' },
    { id: 'y', nome: 'João Lima' },
  ];
  const inicial = plano(ctx.folhaCasarNome('Maria S.', unico));
  assert.equal(inicial.id, 'x');
  assert.equal(inicial.nivel, 'provavel');
});

test('folhaCasarNome: nome idêntico (mesmas letras) ainda é "exato" mesmo havendo um nome mais longo parecido', () => {
  const equipe = [
    { id: 'a', nome: 'Pedro Alves' },
    { id: 'b', nome: 'Pedro Alves Junior' },
  ];
  const r = plano(ctx.folhaCasarNome('Pedro Alves', equipe));
  assert.equal(r.id, 'a');
  assert.equal(r.nivel, 'exato');
});
