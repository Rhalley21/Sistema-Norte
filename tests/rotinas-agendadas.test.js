// =========================================================================
// Rotinas agendadas: lembretes de prazo das avaliações por e-mail, escalonamento
// das justificativas do Ponto e prazo do banco de talentos — tudo rodando SOZINHO,
// sem depender de alguém abrir uma tela. Testa as regras (quando lembrar, de quem é
// a vez, o que NÃO enviar), o comportamento do escalonamento com banco e e-mail
// simulados, e que a rotina nunca escreve nos dados da empresa.
// =========================================================================
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

function rotina() {
  const origem = ler('supabase/functions/rotinas-agendadas/index.ts');
  const ini = origem.indexOf('const BANCO_TALENTOS_MESES');
  const fim = origem.indexOf('// ---- fim: ajudantes puros');
  assert.ok(ini >= 0 && fim > ini);
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, RegExp });
  vm.runInContext(
    nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)) +
      '\nthis.__c = { BANCO_TALENTOS_MESES, DIAS_LEMBRETE, DIAS_RETENCAO_LOG }; this.__t = { TRIAL_DIAS_AVISO };',
    ctx
  );
  return ctx;
}

// ---------- contar dias ----------
test('diasAteOPrazo: hoje, futuro, passado, virada de mês e de ano', opcoes, () => {
  const c = rotina();
  assert.equal(c.diasAteOPrazo('2026-10-10', '2026-10-10'), 0);
  assert.equal(c.diasAteOPrazo('2026-10-15', '2026-10-10'), 5);
  assert.equal(c.diasAteOPrazo('2026-10-07', '2026-10-10'), -3);
  assert.equal(c.diasAteOPrazo('2026-11-02', '2026-10-30'), 3);
  assert.equal(c.diasAteOPrazo('2027-01-02', '2026-12-31'), 2);
  assert.equal(c.diasAteOPrazo('2024-03-01', '2024-02-28'), 2); // ano bissexto
});

test('diasAteOPrazo: data inválida ou ausente devolve null (nunca um número errado)', opcoes, () => {
  const c = rotina();
  assert.equal(c.diasAteOPrazo(null, '2026-10-10'), null);
  assert.equal(c.diasAteOPrazo('', '2026-10-10'), null);
  assert.equal(c.diasAteOPrazo('amanhã', '2026-10-10'), null);
  assert.equal(c.diasAteOPrazo('10/10/2026', '2026-10-10'), null);
  assert.equal(c.diasAteOPrazo(undefined, '2026-10-10'), null);
  assert.equal(c.diasAteOPrazo('2026-10-15', 'hoje'), null);
});

test('o servidor e a tela contam os dias até o prazo do MESMO jeito (a regra do aviso na tela)', opcoes, () => {
  const c = rotina();
  const cli = carregarArquivos(['js/02-core-helpers.js', 'js/15-page-ciclos-avaliacao.js']);
  const hojeServidor = c.hojeBrasilISO(Date.now());
  assert.equal(
    hojeServidor,
    cli.hojeLocalISO(),
    'o "hoje" do servidor (UTC−3) precisa bater com o do navegador no Brasil'
  );
  for (let k = -4; k <= 8; k++) {
    const d = new Date();
    d.setDate(d.getDate() + k);
    const prazo = cli.dataLocalISO(d);
    assert.equal(
      c.diasAteOPrazo(prazo, hojeServidor),
      cli.diasAteVencimento({ prazoLimite: prazo }),
      `diverge com prazo daqui a ${k} dias`
    );
  }
});

// ---------- quando lembrar ----------
const HOJE = '2026-10-10';
const ciclo = (extra = {}) => ({
  id: 'c1',
  colaboradorId: 'p1',
  estado: 'Aberto',
  etapa: 'lider',
  tipoAvaliacao: 'assincrono',
  prazoLimite: '2026-10-15',
  ...extra,
});

test('cicloPrecisaLembrete: lembra em D-5, D-2 e D-0 — e só nesses dias', opcoes, () => {
  const c = rotina();
  assert.deepEqual(plano(c.__c.DIAS_LEMBRETE), [5, 2, 0]);
  for (const [dias, prazo] of [
    [5, '2026-10-15'],
    [2, '2026-10-12'],
    [0, '2026-10-10'],
  ]) {
    assert.deepEqual(plano(c.cicloPrecisaLembrete(ciclo({ prazoLimite: prazo }), HOJE)), { dias, etapa: 'lider' });
  }
  ['2026-10-16', '2026-10-14', '2026-10-13', '2026-10-11', '2026-10-09', '2026-09-30'].forEach((prazo) =>
    assert.equal(c.cicloPrecisaLembrete(ciclo({ prazoLimite: prazo }), HOJE), null, prazo)
  );
});

test('cicloPrecisaLembrete: ciclo encerrado, em pendência, ao vivo ou sem dados NÃO recebe lembrete', opcoes, () => {
  const c = rotina();
  ['Encerrado', 'Finalizado', 'Pendência de Avaliador', 'Cancelado', undefined].forEach((estado) =>
    assert.equal(c.cicloPrecisaLembrete(ciclo({ estado, prazoLimite: '2026-10-12' }), HOJE), null, String(estado))
  );
  assert.notEqual(c.cicloPrecisaLembrete(ciclo({ estado: 'Em Consolidação', prazoLimite: '2026-10-12' }), HOJE), null);
  assert.equal(c.cicloPrecisaLembrete(ciclo({ tipoAvaliacao: 'ao_vivo', prazoLimite: '2026-10-12' }), HOJE), null);
  assert.equal(c.cicloPrecisaLembrete(ciclo({ prazoLimite: undefined }), HOJE), null);
  assert.equal(c.cicloPrecisaLembrete(ciclo({ id: undefined }), HOJE), null);
  assert.equal(c.cicloPrecisaLembrete(ciclo({ colaboradorId: undefined }), HOJE), null);
  assert.equal(c.cicloPrecisaLembrete(null, HOJE), null);
});

test('cicloPrecisaLembrete: a etapa vem do ciclo; sem etapa ou etapa estranha cai em "colaborador"', opcoes, () => {
  const c = rotina();
  const dias2 = { prazoLimite: '2026-10-12' };
  assert.equal(c.cicloPrecisaLembrete(ciclo({ ...dias2, etapa: 'rh' }), HOJE).etapa, 'rh');
  assert.equal(c.cicloPrecisaLembrete(ciclo({ ...dias2, etapa: 'colaborador' }), HOJE).etapa, 'colaborador');
  assert.equal(c.cicloPrecisaLembrete(ciclo({ ...dias2, etapa: undefined }), HOJE).etapa, 'colaborador');
  assert.equal(c.cicloPrecisaLembrete(ciclo({ ...dias2, etapa: 'hacker' }), HOJE).etapa, 'colaborador');
});

// ---------- quem NÃO recebe ----------
test(
  'empresaRecebeEmail: suspensa e teste vencido sem virar cliente não recebem; pagante e teste em dia recebem',
  opcoes,
  () => {
    const c = rotina();
    const agora = Date.parse('2026-10-10T12:00:00Z');
    assert.equal(c.empresaRecebeEmail({ acesso_suspenso: true }, agora), false);
    assert.equal(c.empresaRecebeEmail({ trial_ate: '2026-10-01T00:00:00Z', is_pagante: false }, agora), false);
    assert.equal(c.empresaRecebeEmail({ trial_ate: '2026-10-01T00:00:00Z', is_pagante: true }, agora), true);
    assert.equal(c.empresaRecebeEmail({ trial_ate: '2026-10-20T00:00:00Z', is_pagante: false }, agora), true);
    assert.equal(c.empresaRecebeEmail({}, agora), true);
    assert.equal(c.empresaRecebeEmail(null, agora), false);
    assert.equal(c.empresaRecebeEmail(undefined, agora), false);
  }
);

test('lembretesLigados: a empresa pode desligar em Configurações; o padrão é ligado', opcoes, () => {
  const c = rotina();
  assert.equal(c.lembretesLigados({ notificacoes: { lembretesPrazo: false } }), false);
  assert.equal(c.lembretesLigados({ notificacoes: { lembretesPrazo: true } }), true);
  assert.equal(c.lembretesLigados({}), true);
  assert.equal(c.lembretesLigados(null), true);
  assert.equal(c.lembretesLigados(undefined), true);
});

// ---------- não duplicar ----------
test('chaveLembrete: um lembrete por ciclo + etapa + dia — etapa nova ou dia novo geram chave nova', opcoes, () => {
  const c = rotina();
  const base = c.chaveLembrete('c1', 'lider', 5);
  assert.equal(base, c.chaveLembrete('c1', 'lider', 5)); // mesma rodada = mesma chave (não duplica)
  assert.notEqual(base, c.chaveLembrete('c1', 'lider', 2));
  assert.notEqual(base, c.chaveLembrete('c1', 'rh', 5)); // o RH também precisa ser lembrado quando chegar a vez dele
  assert.notEqual(base, c.chaveLembrete('c2', 'lider', 5));
});

// ---------- conteúdo ----------
test('quandoVence e corpoLembrete: texto certo, data em dd/mm/aaaa e nome sem HTML injetado', opcoes, () => {
  const c = rotina();
  assert.equal(c.quandoVence(0), 'vence hoje');
  assert.equal(c.quandoVence(1), 'vence em 1 dia');
  assert.equal(c.quandoVence(2), 'vence em 2 dias');
  assert.equal(c.quandoVence(5), 'vence em 5 dias');
  const html = c.corpoLembrete('Maria <img src=x onerror=alert(1)>', 'rh', 2, '2026-10-12');
  assert.ok(html.includes('vence em 2 dias') && html.includes('12/10/2026') && html.includes('a avaliação do RH'));
  assert.ok(!html.includes('<img'), 'o nome do colaborador precisa ser escapado');
  assert.ok(c.corpoLembrete('Ana', 'colaborador', 0, '2026-10-10').includes('sua autoavaliação'));
  assert.ok(c.corpoLembrete('Ana', 'lider', 0, '2026-10-10').includes('líder direto'));
});

// ---------- prazos e datas ----------
test(
  'banco de talentos: o prazo e o cálculo são os MESMOS da função "rs" e do texto prometido ao candidato',
  opcoes,
  () => {
    const c = rotina();
    assert.equal(c.__c.BANCO_TALENTOS_MESES, 24);
    const origemRs = ler('supabase/functions/rs/index.ts');
    assert.equal(
      Number(/const BANCO_TALENTOS_MESES = (\d+)/.exec(origemRs)[1]),
      c.__c.BANCO_TALENTOS_MESES,
      'a rotina e a função rs divergem no prazo'
    );
    assert.ok(ler('vaga.html').includes(`por até ${c.__c.BANCO_TALENTOS_MESES} meses`));
    const rs = (() => {
      const o = origemRs;
      const i = o.indexOf('function mesesAtras');
      const ctx = vm.createContext({ Date });
      vm.runInContext(nodeModule.stripTypeScriptTypes(o.slice(i, o.indexOf('function mesesDepois'))), ctx);
      return ctx;
    })();
    const agora = Date.parse('2026-10-10T12:00:00Z');
    assert.equal(c.mesesAtras(agora, 24), rs.mesesAtras(agora, 24));
  }
);

test('hojeBrasilISO: às 21h30 de Brasília ainda é o mesmo dia (o lembrete não "pula" um dia)', opcoes, () => {
  const c = rotina();
  assert.equal(c.hojeBrasilISO(Date.UTC(2026, 9, 11, 0, 30)), '2026-10-10'); // 21h30 BRT do dia 10
  assert.equal(c.hojeBrasilISO(Date.UTC(2026, 9, 11, 11, 0)), '2026-10-11'); // 8h BRT do dia 11 (horário da rotina)
});

test('a limpeza do log guarda mais que as janelas de 30 dias dos limites de uso (senão zerariam)', opcoes, () => {
  const c = rotina();
  assert.ok(c.__c.DIAS_RETENCAO_LOG > 30);
  assert.ok(/interval '35 days'/.test(ler('sql/35-rate-limit.sql')), 'a limpeza do SQL 35 apagava com 7 dias');
  assert.ok(!/interval '7 days'/.test(ler('sql/35-rate-limit.sql')));
  for (const f of ['folha-ponto', 'assistente-ajuda']) {
    const src = ler(`supabase/functions/${f}/index.ts`);
    assert.ok(/24 \* 30|24 \* 30/.test(src), `${f} usa janela de 30 dias`);
  }
});

// ---------- a rotina nunca escreve nos dados da empresa ----------
test('rotinas-agendadas e a ação do ponto SÓ LEEM o bloco da empresa (nunca update/insert/delete em dados_sistema)', () => {
  for (const f of ['rotinas-agendadas', 'ponto', 'chamado-automatico']) {
    const src = ler(`supabase/functions/${f}/index.ts`);
    for (const m of src.matchAll(/from\('dados_sistema'\)([\s\S]{0,260})/g)) {
      const ate = m[1].split(';')[0];
      assert.ok(
        !/\.(update|insert|upsert|delete)\(/.test(ate),
        `${f} escreve em dados_sistema — pode sobrescrever o que alguém está editando`
      );
    }
  }
});

// ---------- autenticação e isolamento ----------
test('rotinas-agendadas: "diaria" exige o segredo do agendador ou a chave de serviço; "status" é só do Super Admin', () => {
  const o = ler('supabase/functions/rotinas-agendadas/index.ts');
  assert.ok(o.includes('iguaisSeguro(segredo, CRON_SECRET)') && o.includes('iguaisSeguro(token, chaveServico)'));
  assert.ok(/if \(!autorizado\) return jsonResponse\(\{ error: 'Não autorizado\.' \}, 401\)/.test(o));
  assert.ok(o.includes("from('super_admins')") && o.includes('403'));
  assert.ok(
    o.indexOf("action === 'status'") < o.indexOf('const autorizado'),
    'o status tem a própria autenticação (usuário) e vem antes'
  );
  assert.ok(!o.replace(/\/\/.*$/gm, '').includes('Math.random'));
});

test('rotinas-agendadas: cada tarefa é isolada (uma falha não derruba as outras) e a falha avisa a equipe', () => {
  const o = ler('supabase/functions/rotinas-agendadas/index.ts');
  for (const nome of ['lembretes_ciclos', 'escalonamento_ponto', 'banco_talentos', 'limpeza_logs'])
    assert.ok(o.includes(`tarefa('${nome}'`), `tarefa ${nome} fora do isolamento`);
  assert.ok(o.includes('Falha na rotina diária do sistema'));
  assert.ok(o.includes("acao: 'rotina_diaria'"));
});

test('o painel do Super Admin lê os MESMOS nomes de execução que as rotinas gravam', () => {
  assert.ok(
    ler('supabase/functions/rotinas-agendadas/index.ts').includes("ultima('rotina_diaria')") &&
      ler('supabase/functions/rotinas-agendadas/index.ts').includes("ultima('rotina_chamados')")
  );
  assert.ok(ler('supabase/functions/chamado-automatico/index.ts').includes("acao: 'rotina_chamados'"));
  assert.ok(ler('js/23-page-super-admin.js').includes("'rotinas-agendadas'"));
});

test('rotinaStatus (painel): nunca / ok / atrasada conforme a última execução', () => {
  const cli = carregarArquivos(['js/23-page-super-admin.js']);
  const agora = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(cli.rotinaStatus(null, 26, agora), 'nunca');
  assert.equal(cli.rotinaStatus('2026-10-10T11:00:00Z', 26, agora), 'ok');
  assert.equal(cli.rotinaStatus('2026-10-09T12:30:00Z', 26, agora), 'ok'); // 23h30 atrás, a diária roda a cada 24h
  assert.equal(cli.rotinaStatus('2026-10-08T12:00:00Z', 26, agora), 'atrasada');
  assert.equal(cli.rotinaStatus('2026-10-10T09:30:00Z', 3, agora), 'ok'); // 2h30 atrás, a rotina de chamados roda de hora em hora
  assert.equal(cli.rotinaStatus('2026-10-10T08:00:00Z', 3, agora), 'atrasada'); // 4h atrás
});

// ---------- agendamento documentado e coerente ----------
test('o horário da rotina diária: 11h UTC = 8h de Brasília, igual no SQL, na documentação e no texto', () => {
  assert.ok(ler('sql/39-rotinas-agendadas.sql').includes("'0 11 * * *'"));
  assert.ok(ler('docs/ROTINAS-AGENDADAS.md').includes("'0 11 * * *'"));
  assert.ok(
    ler('docs/ROTINAS-AGENDADAS.md').includes('x-cron-secret') &&
      ler('docs/ROTINAS-AGENDADAS.md').includes('"action":"diaria"')
  );
  assert.equal(new Date(Date.UTC(2026, 9, 10, 11, 0) - 3 * 3600000).getUTCHours(), 8);
});

test('o assistente e as telas descrevem os lembretes como realmente funcionam (e-mail em D-5, D-2, D-0)', () => {
  const kb = ler('supabase/functions/assistente-ajuda/index.ts');
  assert.ok(kb.includes('5 dias antes, 2 dias antes e no dia do prazo') && kb.includes('D-5, D-2 e D-0'));
  assert.ok(
    !kb.includes('lembretes automáticos em D-5'),
    'a base ainda promete "lembretes automáticos" sem dizer como'
  );
  assert.ok(ler('js/15-page-ciclos-avaliacao.js').includes('lembretes por e-mail em D-5, D-2 e D-0'));
  assert.ok(ler('js/41-page-central-ajuda.js').includes('lembrete por e-mail em D-5, D-2 e D-0'));
});

// ---------- ponto: escalonamento ----------
function pontoEscalonamento(mocks = {}) {
  const origem = ler('supabase/functions/ponto/index.ts');
  const ini = origem.indexOf('// ---- Fuso horário (Brasil)');
  const fim = origem.indexOf('// ---- fim: escalonamento');
  assert.ok(ini >= 0 && fim > ini);
  const enviados = [];
  const ctx = vm.createContext({
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Promise,
    JSON,
    console: { error() {}, log() {} },
    Uint8Array,
    atob,
    Deno: {
      env: {
        get: (k) =>
          k === 'SUPABASE_URL'
            ? 'https://x.supabase.co'
            : k === 'SUPABASE_SERVICE_ROLE_KEY'
              ? 'service-key'
              : undefined,
      },
    },
    fetch: async (url, opts) => {
      enviados.push({ url, ...JSON.parse(opts.body), auth: opts.headers.Authorization });
      return { ok: true };
    },
    ...mocks,
  });
  vm.runInContext(nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  ctx.__enviados = enviados;
  return ctx;
}

test('avaliarEscalonamento: só justificativa PENDENTE com 3+ dias sobe (2 dias não; aprovada não)', opcoes, () => {
  const c = pontoEscalonamento();
  const agora = Date.parse('2026-10-10T12:00:00Z');
  const dia = (n) => new Date(agora - n * 86400000 - 1000).toISOString();
  assert.deepEqual(plano(c.avaliarEscalonamento({ status: 'pendente', criado_em: dia(2) }, agora)), {
    dias: 2,
    escalonar: false,
  });
  assert.deepEqual(plano(c.avaliarEscalonamento({ status: 'pendente', criado_em: dia(3) }, agora)), {
    dias: 3,
    escalonar: true,
  });
  assert.deepEqual(plano(c.avaliarEscalonamento({ status: 'pendente', criado_em: dia(10) }, agora)), {
    dias: 10,
    escalonar: true,
  });
  assert.equal(c.avaliarEscalonamento({ status: 'aprovada', criado_em: dia(10) }, agora).escalonar, false);
  assert.equal(c.avaliarEscalonamento({ status: 'rejeitada', criado_em: dia(10) }, agora).escalonar, false);
});

// Banco simulado: tabelas -> linhas; só o que o código usa (select/eq/in/maybeSingle).
function bancoFalso(tabelas) {
  return {
    from(nome) {
      let filtros = [];
      const q = {
        select() {
          return q;
        },
        eq(col, val) {
          filtros.push((l) => l[col] === val);
          return q;
        },
        in(col, vals) {
          filtros.push((l) => vals.includes(l[col]));
          return q;
        },
        maybeSingle: async () => ({ data: (tabelas[nome] || []).find((l) => filtros.every((f) => f(l))) || null }),
        then(res) {
          res({ data: (tabelas[nome] || []).filter((l) => filtros.every((f) => f(l))) });
        },
      };
      return q;
    },
  };
}

test(
  'escalarJustificativa: marca como escalonada e avisa o substituto do gestor E o RH (sem repetir e-mail)',
  opcoes,
  async () => {
    const c = pontoEscalonamento();
    const marcadas = [];
    const ponto = { from: () => ({ update: (v) => ({ eq: async (col, id) => marcadas.push({ v, col, id }) }) }) };
    const principal = bancoFalso({
      perfis: [
        { id: 'g1', empresa_id: 'e1', email: 'gestor@x.com', substituto_perfil_id: 's1', papel: 'lider' },
        { id: 's1', empresa_id: 'e1', email: 'substituto@x.com', papel: 'lider' },
        { id: 'r1', empresa_id: 'e1', email: 'rh@x.com', papel: 'rh' },
        { id: 'o1', empresa_id: 'e1', email: 'dono@x.com', papel: 'owner' },
        { id: 'r2', empresa_id: 'OUTRA', email: 'rh-de-outra-empresa@y.com', papel: 'rh' },
      ],
    });
    const colaboradores = [{ perfilId: 'p1', gestorPerfilId: 'g1' }];
    await c.escalarJustificativa(
      ponto,
      principal,
      'e1',
      colaboradores,
      { p1: 'Maria <b>X</b>' },
      { id: 'j1', perfil_id: 'p1' },
      4
    );
    assert.equal(marcadas.length, 1);
    assert.equal(marcadas[0].id, 'j1');
    assert.equal(marcadas[0].v.escalonado, true);
    const para = c.__enviados.map((e) => e.destinatario).sort();
    assert.deepEqual(para, ['dono@x.com', 'rh@x.com', 'substituto@x.com']);
    assert.ok(!para.includes('rh-de-outra-empresa@y.com'), 'nunca avisar o RH de OUTRA empresa');
    assert.ok(
      c.__enviados.every((e) => e.auth === 'Bearer service-key' && e.url.endsWith('/functions/v1/enviar-email'))
    );
    assert.ok(c.__enviados[0].assunto.includes('4 dias'));
    assert.ok(!c.__enviados[0].corpoHtml.includes('<b>X</b>'), 'o nome do colaborador precisa ser escapado no e-mail');
  }
);

test(
  'escalarJustificativa: sem substituto cadastrado, só o RH/Admin da empresa recebe; sem gestor também funciona',
  opcoes,
  async () => {
    const c = pontoEscalonamento();
    const ponto = { from: () => ({ update: () => ({ eq: async () => {} }) }) };
    const principal = bancoFalso({
      perfis: [
        { id: 'g1', empresa_id: 'e1', email: 'gestor@x.com', substituto_perfil_id: null, papel: 'lider' },
        { id: 'r1', empresa_id: 'e1', email: 'rh@x.com', papel: 'rh' },
      ],
    });
    await c.escalarJustificativa(
      ponto,
      principal,
      'e1',
      [{ perfilId: 'p1', gestorPerfilId: 'g1' }],
      {},
      { id: 'j1', perfil_id: 'p1' },
      3
    );
    assert.deepEqual(
      c.__enviados.map((e) => e.destinatario),
      ['rh@x.com']
    );
    const c2 = pontoEscalonamento();
    await c2.escalarJustificativa(ponto, principal, 'e1', [], {}, { id: 'j2', perfil_id: 'sem-colaborador' }, 5);
    assert.deepEqual(
      c2.__enviados.map((e) => e.destinatario),
      ['rh@x.com']
    );
  }
);

test('escalarJustificativa: uma falha no e-mail NÃO desfaz a marcação nem derruba a rotina', opcoes, async () => {
  const marcadas = [];
  const c = pontoEscalonamento({
    fetch: async () => {
      throw new Error('rede caiu');
    },
  });
  const ponto = { from: () => ({ update: () => ({ eq: async (_c, id) => marcadas.push(id) }) }) };
  const principal = bancoFalso({ perfis: [{ id: 'r1', empresa_id: 'e1', email: 'rh@x.com', papel: 'rh' }] });
  await assert.doesNotReject(c.escalarJustificativa(ponto, principal, 'e1', [], {}, { id: 'j1', perfil_id: 'p1' }, 3));
  assert.deepEqual(marcadas, ['j1']);
});

test('ponto: a ação da rotina só aceita a chave de serviço, vem ANTES do login de usuário e a listagem usa a mesma função', () => {
  const o = ler('supabase/functions/ponto/index.ts');
  assert.equal(
    (o.match(/const LIMITE_DIAS_ESCALONA = 3/g) || []).length,
    1,
    'a regra dos 3 dias deve existir uma vez só'
  );
  const iRotina = o.indexOf("corpoPrevio?.action === 'rotina_escalonamento'");
  assert.ok(iRotina > 0 && iRotina < o.indexOf('principal.auth.getUser()'));
  const bloco = o.slice(iRotina, iRotina + 700);
  assert.ok(
    bloco.includes('SUPABASE_SERVICE_ROLE_KEY') && bloco.includes("'Não autorizado.'") && bloco.includes('401')
  );
  assert.ok(
    o.includes('await escalarJustificativa(ponto, principalAdmin, perfil.empresa_id'),
    'a tela de conferência continua escalonando'
  );
  assert.ok(o.includes('await escalarJustificativa(pontoRotina, admin, empresaId'), 'a rotina usa a mesma lógica');
  assert.ok(
    o.includes(".eq('status', 'pendente')") && o.includes(".eq('escalonado', false)"),
    'a rotina só pega pendentes ainda não escalonadas'
  );
});

test('as tarefas da rotina diária são todas isoladas (inclusive as novas) e o resumo do teste vai pra equipe', () => {
  const o = ler('supabase/functions/rotinas-agendadas/index.ts');
  for (const nome of [
    'lembretes_ciclos',
    'escalonamento_ponto',
    'banco_talentos',
    'teste_gratis',
    'nr1_campanhas',
    'videos_rs',
    'entregas_rs',
    'limpeza_logs',
  ])
    assert.ok(o.includes(`tarefa('${nome}'`), `tarefa ${nome} fora do isolamento`);
});

test(
  'fim do teste grátis: os dias de aviso e o texto prometido são os mesmos no código, na documentação e na base do assistente',
  opcoes,
  () => {
    const c = rotina();
    assert.deepEqual(plano(c.__t.TRIAL_DIAS_AVISO), [2, 0, -1, -7]);
    const doc = ler('docs/ROTINAS-AGENDADAS.md');
    assert.ok(doc.includes('2 dias antes') && doc.includes('no último dia') && doc.includes('1 e 7 dias depois'));
    const kb = ler('supabase/functions/assistente-ajuda/index.ts');
    assert.ok(kb.includes('2 dias antes do fim do teste, no último dia, e depois (1 e 7 dias após o fim)'));
  }
);

test('o WhatsApp dos e-mails de fim de teste é o MESMO da página de vendas (nunca divergem)', () => {
  const numero = /CTA_URL = 'https:\/\/wa\.me\/(\d+)/.exec(ler('index.html'))[1]; // a constante usada nos botões da página
  assert.equal(numero, '558999857062');
  assert.ok(ler('supabase/functions/rotinas-agendadas/index.ts').includes(`wa.me/${numero}`));
});

test('NR1: a rotina usa a MESMA regra de encerramento da função nr1 (ativa + data final anterior a hoje no Brasil)', () => {
  const nr1 = ler('supabase/functions/nr1/index.ts');
  const rot = ler('supabase/functions/rotinas-agendadas/index.ts');
  for (const src of [nr1, rot]) {
    assert.ok(src.includes("status: 'encerrada'") && src.includes('auto_encerrada: true'));
    assert.ok(src.includes(".eq('status', 'ativa')") && /\.lt\('data_fim', hoje\)/.test(src));
  }
});
