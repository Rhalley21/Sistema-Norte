// =========================================================================
// Testa o tratamento de FUSO HORÁRIO — o sistema é do Brasil (UTC−3), mas o
// servidor e o `toISOString()` trabalham em UTC. Dois bugs reais vinham daí:
//  1) o banco de horas do servidor comparava a hora da batida em UTC (11:00)
//     com a jornada em horário local (08:00): tolerância perdida e crédito
//     indevido pra quem chega cedo;
//  2) "hoje" calculado em UTC vira o dia seguinte às 21h — batida da noite
//     contada no dia errado, campanha NR1 fechada 3h antes, ciclo com data errada.
// =========================================================================
process.env.TZ = 'America/Sao_Paulo'; // antes de qualquer Date
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const fusoAplicado = new Date(2026, 9, 5, 22, 0).getTimezoneOffset() === 180;
const semFuso = fusoAplicado ? {} : { skip: 'não consegui fixar TZ=America/Sao_Paulo neste sistema' };
const semTs =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

// ---------------- cliente (js/02-core-helpers.js) ----------------
const cli = carregarArquivos(['js/02-core-helpers.js']);

test('dataLocalISO: às 22h30 de Brasília ainda é o MESMO dia (toISOString diria o dia seguinte)', semFuso, () => {
  const noite = new Date(2026, 9, 5, 22, 30); // 05/10/2026 22:30 local
  assert.equal(noite.toISOString().slice(0, 10), '2026-10-06'); // o bug antigo
  assert.equal(cli.dataLocalISO(noite), '2026-10-05'); // o certo
});

test('dataLocalISO / hojeLocalISO: formato AAAA-MM-DD com zero à esquerda', semFuso, () => {
  assert.equal(cli.dataLocalISO(new Date(2026, 0, 3, 9, 0)), '2026-01-03');
  assert.equal(cli.dataLocalISO(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(cli.hojeLocalISO(), cli.dataLocalISO(new Date()));
  assert.match(cli.hojeLocalISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('dataLocalISO: aceita carimbo (string) e Date', semFuso, () => {
  assert.equal(cli.dataLocalISO('2026-10-06T01:30:00.000Z'), '2026-10-05'); // 22:30 em Brasília
});

test('diaLocalDoRegistro: batida às 22h de Brasília pertence ao dia local, não ao dia UTC', semFuso, () => {
  assert.equal(cli.diaLocalDoRegistro('2026-10-06T01:00:00.000Z'), '2026-10-05'); // 22:00 BRT
  assert.equal(cli.diaLocalDoRegistro('2026-10-05T11:00:00.000Z'), '2026-10-05'); // 08:00 BRT
  assert.equal(cli.diaLocalDoRegistro('2026-10-05T02:59:00.000Z'), '2026-10-04'); // 23:59 BRT do dia anterior
});

test(
  'dataDeExibicao: data só-dia aparece no dia certo (new Date("AAAA-MM-DD") mostraria o dia anterior)',
  semFuso,
  () => {
    assert.equal(new Date('2026-10-10').getDate(), 9); // o bug antigo (lê em UTC)
    const certo = cli.dataDeExibicao('2026-10-10');
    assert.equal(certo.getDate(), 10);
    assert.equal(certo.getMonth(), 9);
  }
);

test('dataDeExibicao: carimbos completos e Date passam sem alteração', semFuso, () => {
  const carimbo = '2026-10-10T15:00:00.000Z';
  assert.equal(cli.dataDeExibicao(carimbo).getTime(), new Date(carimbo).getTime());
  const d = new Date(2026, 0, 1);
  assert.equal(cli.dataDeExibicao(d).getTime(), d.getTime()); // (outro 'realm' do vm: compara pelo instante)
});

test('o código do cliente não volta a derivar "hoje" do UTC (regressão)', () => {
  const ofensores = [];
  fs.readdirSync(path.join(raiz, 'js'))
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      fs.readFileSync(path.join(raiz, 'js', f), 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (/toISOString\(\)\.slice\(0, ?10\)/.test(linha)) ofensores.push(`${f}:${i + 1}`);
          if (/registrado_em\.(slice|substring)\(0, ?10\)/.test(linha))
            ofensores.push(`${f}:${i + 1} (agrupa batida por data UTC)`);
        });
    });
  assert.deepEqual(
    ofensores,
    [],
    'use hojeLocalISO()/dataLocalISO()/diaLocalDoRegistro() em vez de toISOString().slice(0, 10)'
  );
});

// ---------------- servidor (supabase/functions/ponto) ----------------
function carregarFuso() {
  const origem = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'ponto', 'index.ts'), 'utf8');
  const ini = origem.indexOf('// ---- Fuso horário (Brasil)');
  const fim = origem.indexOf('// ---- fim: fuso horário');
  assert.ok(ini > 0 && fim > ini, 'não achei o bloco de fuso na função ponto');
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Set, Object });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}

test('servidor: diaLocal e minutosDoDiaLocal convertem UTC → horário de Brasília', semTs, () => {
  const c = carregarFuso();
  assert.equal(c.diaLocal('2026-10-06T01:30:00Z'), '2026-10-05');
  assert.equal(c.diaLocal('2026-10-05T11:00:00Z'), '2026-10-05');
  assert.equal(c.minutosDoDiaLocal('2026-10-05T11:00:00Z'), 8 * 60);
  assert.equal(c.minutosDoDiaLocal('2026-10-06T01:30:00Z'), 22 * 60 + 30);
  assert.equal(c.minutosDoDiaLocal('2026-10-05T02:59:00Z'), 23 * 60 + 59); // dia anterior, 23:59 BRT
});

test('servidor: localParaUtc é o inverso (08:00 em Brasília = 11:00 UTC)', semTs, () => {
  const c = carregarFuso();
  assert.equal(c.localParaUtc('2026-10-05', 8, 0).toISOString(), '2026-10-05T11:00:00.000Z');
  assert.equal(c.localParaUtc('2026-10-05', 17, 5).toISOString(), '2026-10-05T20:05:00.000Z');
  assert.equal(c.diaLocal(c.localParaUtc('2026-10-05', 22, 30).toISOString()), '2026-10-05');
});

test('servidor: agoraBrasil + getUTC* dá a data/hora do relógio de Brasília', semTs, () => {
  const c = carregarFuso();
  const d = c.agoraBrasil(Date.UTC(2026, 9, 6, 1, 30)); // 01:30 UTC = 22:30 do dia 05 em Brasília
  assert.equal(d.getUTCDate(), 5);
  assert.equal(d.getUTCHours(), 22);
});

// Batida no relógio de Brasília -> carimbo UTC, como o banco guarda.
const bat = (c, dia, hhmm, tipo) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { tipo, registrado_em: c.localParaUtc(dia, h, m).toISOString() };
};
const JORNADA = { entrada: '08:00', saida: '17:00', toleranciaMin: 10 };

test(
  'banco de horas: colaborador PONTUAL (08:00–17:00 em Brasília) tem saldo ZERO — regressão do bug de fuso',
  semTs,
  () => {
    const c = carregarFuso();
    const regs = [bat(c, '2026-10-05', '08:00', 'entrada'), bat(c, '2026-10-05', '17:00', 'saida')];
    assert.equal(c.calcularSaldoBancoHoras(regs, JORNADA, new Set()), 0);
  }
);

test('banco de horas: chegar CEDO não gera crédito (antes dava +minutos por causa do fuso)', semTs, () => {
  const c = carregarFuso();
  const regs = [bat(c, '2026-10-05', '07:30', 'entrada'), bat(c, '2026-10-05', '17:00', 'saida')];
  assert.equal(c.calcularSaldoBancoHoras(regs, JORNADA, new Set()), 0);
});

test('banco de horas: tolerância de 10 min vale na entrada e na saída', semTs, () => {
  const c = carregarFuso();
  assert.equal(
    c.calcularSaldoBancoHoras(
      [bat(c, '2026-10-05', '08:10', 'entrada'), bat(c, '2026-10-05', '17:10', 'saida')],
      JORNADA,
      new Set()
    ),
    0
  );
  assert.equal(
    c.calcularSaldoBancoHoras(
      [bat(c, '2026-10-05', '08:30', 'entrada'), bat(c, '2026-10-05', '17:00', 'saida')],
      JORNADA,
      new Set()
    ),
    -20
  );
  assert.equal(
    c.calcularSaldoBancoHoras(
      [bat(c, '2026-10-05', '08:00', 'entrada'), bat(c, '2026-10-05', '18:00', 'saida')],
      JORNADA,
      new Set()
    ),
    50
  );
});

test('banco de horas: atraso e extra no mesmo dia se compensam; vários dias somam', semTs, () => {
  const c = carregarFuso();
  const regs = [
    bat(c, '2026-10-05', '08:30', 'entrada'), // atraso 20
    bat(c, '2026-10-05', '18:00', 'saida'), // extra 50
    bat(c, '2026-10-06', '08:00', 'entrada'),
    bat(c, '2026-10-06', '17:40', 'saida'), // extra 30
  ];
  assert.equal(c.calcularSaldoBancoHoras(regs, JORNADA, new Set()), 60);
});

test('banco de horas: dia abonado não entra no saldo', semTs, () => {
  const c = carregarFuso();
  const regs = [bat(c, '2026-10-05', '09:30', 'entrada'), bat(c, '2026-10-05', '17:00', 'saida')];
  assert.equal(c.calcularSaldoBancoHoras(regs, JORNADA, new Set(['2026-10-05'])), 0);
});

test(
  'banco de horas: saída depois das 21h de Brasília fica NO MESMO DIA da entrada (antes caía no dia seguinte)',
  semTs,
  () => {
    const c = carregarFuso();
    // entrou 08:00, saiu 22:00 (= 01:00 UTC do dia seguinte). Extra correto: 22:00 − 17:00 − 10 = 290
    const regs = [bat(c, '2026-10-05', '08:00', 'entrada'), bat(c, '2026-10-05', '22:00', 'saida')];
    assert.equal(c.calcularSaldoBancoHoras(regs, JORNADA, new Set()), 290);
  }
);

test('banco de horas: sem jornada de entrada/saída definida, nada é inventado', semTs, () => {
  const c = carregarFuso();
  const regs = [bat(c, '2026-10-05', '09:00', 'entrada'), bat(c, '2026-10-05', '20:00', 'saida')];
  assert.equal(c.calcularSaldoBancoHoras(regs, {}, new Set()), 0);
  assert.equal(c.calcularSaldoBancoHoras([], JORNADA, new Set()), 0);
});

// ---------------- NR1: data de hoje no Brasil ----------------
test('nr1: hojeBrasilISO não vira o dia às 21h de Brasília (a campanha não fecha 3h antes)', semTs, () => {
  const origem = fs.readFileSync(path.join(raiz, 'supabase', 'functions', 'nr1', 'index.ts'), 'utf8');
  const ini = origem.indexOf('function hojeBrasilISO');
  const fim = origem.indexOf('serve(async');
  const ctx = vm.createContext({ Date, Math });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  assert.equal(ctx.hojeBrasilISO(Date.UTC(2026, 9, 6, 0, 30)), '2026-10-05'); // 21:30 de Brasília do dia 05
  assert.equal(ctx.hojeBrasilISO(Date.UTC(2026, 9, 6, 2, 59)), '2026-10-05'); // 23:59 de Brasília
  assert.equal(ctx.hojeBrasilISO(Date.UTC(2026, 9, 6, 3, 0)), '2026-10-06'); // meia-noite de Brasília
});
