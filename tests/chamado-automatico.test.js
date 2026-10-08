// =========================================================================
// Central de Ajuda automática: a IA responde sozinha só dúvida de uso;
// cobrança, cancelamento, LGPD, jurídico e segurança vão SEMPRE pra uma pessoa;
// chamado sem retorno é encerrado; a equipe é lembrada do que está parado.
// Os trechos testados são os do próprio código da Edge Function.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };

function funcao() {
  const origem = ler('supabase/functions/chamado-automatico/index.ts');
  const ini = origem.indexOf('// ---- Ajudantes puros');
  const fim = origem.indexOf('// ---- fim: ajudantes puros');
  assert.ok(ini >= 0 && fim > ini);
  const consts = `const DIAS_AUTOFECHAR = 3; const HORAS_LEMBRETE = 24;`;
  const ctx = vm.createContext({ Date, String, Array, RegExp, Number });
  vm.runInContext(consts + nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)), ctx);
  return ctx;
}

// ---------- assuntos que NUNCA vão pra IA ----------
const SO_HUMANO = [
  ['Não recebi o boleto', 'preciso da segunda via'],
  ['Cobrança duplicada', 'fui cobrado duas vezes'],
  ['Quero cancelar o meu plano', ''],
  ['Cancelar assinatura', 'não quero mais'],
  ['Solicitação de direitos da LGPD', 'quero apagar meus dados'],
  ['Excluir meus dados', ''],
  ['Dúvida', 'preciso da nota fiscal do mês'],
  ['Problema', 'acho que minha conta foi invadida'],
  ['Vazamento', 'senha vazou'],
  ['Reembolso', ''],
  ['Ajuda', 'vou procurar um advogado e o Procon'],
];
const PODE_IA = [
  ['Como convido um colaborador?', ''],
  ['Banco de horas', 'como funciona o saldo do banco de horas?'],
  ['Não aparece o menu Ponto', ''],
  ['Cancelar um ciclo de avaliação', 'como cancelo um ciclo que abri errado?'], // "cancelar" sozinho NÃO é cancelamento de contrato
  ['Como exporto relatório', 'quero o PDF do consolidado'],
  ['Esqueci a senha', ''],
];

test(
  'exigeAtendimentoHumano: cobrança, cancelamento, LGPD, jurídico e segurança vão SEMPRE pra uma pessoa',
  opcoes,
  () => {
    const c = funcao();
    SO_HUMANO.forEach(([a, m]) =>
      assert.equal(c.exigeAtendimentoHumano(a, m), true, `deveria exigir humano: "${a}" / "${m}"`)
    );
  }
);

test(
  'exigeAtendimentoHumano: dúvida de uso comum pode ser respondida pela IA (inclusive "cancelar um ciclo")',
  opcoes,
  () => {
    const c = funcao();
    PODE_IA.forEach(([a, m]) =>
      assert.equal(c.exigeAtendimentoHumano(a, m), false, `não deveria bloquear: "${a}" / "${m}"`)
    );
  }
);

test(
  'exigeAtendimentoHumano: o botão "Solicitar meus dados (LGPD)" gera um chamado que a IA nunca toca',
  opcoes,
  () => {
    const c = funcao();
    const assunto = 'Solicitação de direitos da LGPD';
    const mensagem =
      'Solicito, nos termos da LGPD (art. 18), o seguinte sobre meus dados pessoais no sistema:\n\n[ ] Acesso aos meus dados';
    assert.equal(c.exigeAtendimentoHumano(assunto, mensagem), true);
  }
);

test('perguntaDoChamado: junta assunto e texto e limita a 1200 caracteres (o limite do assistente)', opcoes, () => {
  const c = funcao();
  assert.equal(c.perguntaDoChamado('Ponto', 'não aparece'), 'Assunto: Ponto\n\nnão aparece');
  assert.equal(c.perguntaDoChamado('x', 'y'.repeat(5000)).length, 1200);
});

// ---------- rotina ----------
const H = 3600000;
const agora = Date.parse('2026-10-10T12:00:00Z');
const iso = (msAtras) => new Date(agora - msAtras).toISOString();
const base = {
  status: 'respondido_ia',
  criado_em: iso(10 * 24 * H),
  respondido_em: iso(4 * 24 * H),
  feedback_cliente: null,
  lembrete_enviado_em: null,
};

test('precisaFechar: só respondido pela IA, sem retorno e com 3+ dias', opcoes, () => {
  const c = funcao();
  assert.equal(c.precisaFechar(base, agora, 3), true);
  assert.equal(c.precisaFechar({ ...base, respondido_em: iso(2 * 24 * H) }, agora, 3), false); // ainda no prazo
  assert.equal(c.precisaFechar({ ...base, respondido_em: iso(3 * 24 * H) }, agora, 3), true); // exatamente 3 dias
  assert.equal(c.precisaFechar({ ...base, feedback_cliente: 'nao_resolveu' }, agora, 3), false); // cliente reagiu
  assert.equal(c.precisaFechar({ ...base, status: 'em_andamento' }, agora, 3), false); // equipe está tratando
  assert.equal(c.precisaFechar({ ...base, status: 'aberto' }, agora, 3), false);
  assert.equal(c.precisaFechar({ ...base, respondido_em: null }, agora, 3), false);
});

test('precisaLembrete: aberto/em andamento parado há 24h+, e não repete antes de 24h', opcoes, () => {
  const c = funcao();
  const aberto = { ...base, status: 'aberto', criado_em: iso(30 * H), respondido_em: null };
  assert.equal(c.precisaLembrete(aberto, agora, 24), true);
  assert.equal(c.precisaLembrete({ ...aberto, criado_em: iso(10 * H) }, agora, 24), false); // ainda é cedo
  assert.equal(c.precisaLembrete({ ...aberto, status: 'em_andamento' }, agora, 24), true);
  assert.equal(c.precisaLembrete({ ...aberto, lembrete_enviado_em: iso(5 * H) }, agora, 24), false); // lembrou há pouco
  assert.equal(c.precisaLembrete({ ...aberto, lembrete_enviado_em: iso(25 * H) }, agora, 24), true); // já passou 24h do lembrete
  assert.equal(c.precisaLembrete({ ...aberto, status: 'resolvido' }, agora, 24), false);
  assert.equal(c.precisaLembrete({ ...aberto, status: 'respondido_ia' }, agora, 24), false); // quem espera é o cliente, não a equipe
});

test('horaBrasil: o resumo diário sai às 8h de Brasília (11h UTC), não às 8h UTC', opcoes, () => {
  const c = funcao();
  assert.equal(c.horaBrasil(Date.UTC(2026, 9, 10, 11, 0)), 8);
  assert.equal(c.horaBrasil(Date.UTC(2026, 9, 10, 8, 0)), 5);
  assert.equal(c.horaBrasil(Date.UTC(2026, 9, 10, 2, 30)), 23);
});

test('protocoloDe e escaparHtml: mesmo protocolo da tela, e e-mail sem HTML injetado', opcoes, () => {
  const c = funcao();
  assert.equal(c.protocoloDe('3f2b8c1e-9a4d-4e1b-8c7a-1d2e3f4a5b6c'), '3F2B8C1E');
  assert.equal(c.escaparHtml('<b onclick="x">'), '&lt;b onclick=&quot;x&quot;&gt;');
});

// ---------- segurança da função (regressão estática) ----------
test('chamado-automatico: a rotina exige o segredo do agendador; as ações do cliente exigem sessão e a MESMA empresa', () => {
  const o = ler('supabase/functions/chamado-automatico/index.ts');
  assert.ok(o.includes('iguaisSeguro(segredo, CRON_SECRET)'), 'comparar o segredo em tempo constante');
  assert.ok(/if \(!autorizado\) return jsonResponse\(\{ error: 'Não autorizado\.' \}, 401\)/.test(o));
  assert.ok(o.includes('auth.getUser'));
  assert.ok(o.includes('chamado.empresa_id !== perfil.empresa_id'), 'nunca mexer em chamado de outra empresa');
  assert.ok(o.includes("!['owner', 'rh'].includes(perfil.papel)"), 'só quem abriu (ou Admin/RH) mexe no chamado');
  assert.ok(
    o.includes(".eq('ia_tentativas', 0)"),
    'reserva atômica: nunca duas respostas automáticas ao mesmo chamado'
  );
  assert.ok(
    o.indexOf('exigeAtendimentoHumano(chamado.assunto') < o.indexOf('/functions/v1/assistente-ajuda'),
    'o filtro de assunto sensível precisa vir ANTES de chamar a IA'
  );
  assert.ok(!o.replace(/\/\/.*$/gm, '').includes('Math.random'));
});

test('a IA do chamado só entra se a resposta não pedir a equipe (marca do assistente respeitada)', () => {
  const o = ler('supabase/functions/chamado-automatico/index.ts');
  assert.ok(/if \(!resposta \|\| sugerirChamado\) return jsonResponse\(\{ ok: true, resultado: 'humano'/.test(o));
});

// ---------- banco, função e telas concordam sobre os status ----------
test('os 4 status são os mesmos no banco (SQL 38), na função, na tela do cliente e no Super Admin', () => {
  const sql = ler('sql/38-ajuda-automatica.sql');
  const noSql = /status in \(([^)]*)\)/
    .exec(sql)[1]
    .split(',')
    .map((s) => s.trim().replace(/'/g, ''))
    .sort();
  assert.deepEqual(noSql, ['aberto', 'em_andamento', 'resolvido', 'respondido_ia']); // em ordem alfabética
  const cliente = ler('js/41-page-central-ajuda.js');
  const admin = ler('js/23-page-super-admin.js');
  noSql.forEach((st) => {
    assert.ok(cliente.includes(`'${st}'`) || st === 'aberto', `a tela do cliente não trata o status ${st}`);
    assert.ok(admin.includes(st), `o Super Admin não conhece o status ${st}`);
  });
  const rotulos = /STATUS_CHAMADO_LABEL = \{([^}]*)\}/.exec(admin)[1];
  noSql.forEach((st) => assert.ok(rotulos.includes(st), `STATUS_CHAMADO_LABEL sem ${st}`));
  // todo status que a função grava existe no banco
  const gravados = [...ler('supabase/functions/chamado-automatico/index.ts').matchAll(/status: '(\w+)'/g)].map(
    (m) => m[1]
  );
  gravados.forEach((st) => assert.ok(noSql.includes(st), `a função grava status inexistente no banco: ${st}`));
});

test('o prazo de encerramento (3 dias) é o mesmo na função, no FAQ, na base do assistente e no e-mail', () => {
  const dias = Number(/const DIAS_AUTOFECHAR = (\d+)/.exec(ler('supabase/functions/chamado-automatico/index.ts'))[1]);
  assert.equal(dias, 3);
  assert.ok(ler('js/41-page-central-ajuda.js').includes(`em ${dias} dias`));
  assert.ok(ler('supabase/functions/assistente-ajuda/index.ts').includes(`em ${dias} dias`));
});

test('o cliente NÃO altera chamados direto: só insere e lê (o resto passa pela função)', () => {
  const sql = ler('sql/34-central-de-ajuda.sql');
  const politicas = [...sql.matchAll(/create policy "([^"]+)"\s+on chamados_suporte for (\w+)/g)].map(
    (m) => `${m[2]}:${m[1]}`
  );
  const updates = politicas.filter((p) => p.startsWith('update'));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].includes('super admin'), 'só o Super Admin atualiza chamados direto no banco');
  const cliente = ler('js/41-page-central-ajuda.js');
  assert.ok(
    !/from\('chamados_suporte'\)\s*\.update/.test(cliente.replace(/\s+/g, ' ')),
    'a tela do cliente não pode dar update direto'
  );
});

test('Super Admin: o e-mail de mudança de status usa escaparHtml e o campo certo (destinatario/corpoHtml)', () => {
  const admin = ler('js/23-page-super-admin.js');
  const bloco = admin.slice(
    admin.indexOf('async function atualizarChamadoSuporte'),
    admin.indexOf('async function gerarNovoCodigoLicenca')
  );
  assert.ok(bloco.includes('statusMudou') && bloco.includes('respostaMudou'));
  assert.ok(bloco.includes('destinatario:') && bloco.includes('corpoHtml'));
  assert.ok(
    !/\$\{chamado\.assunto\}[^`]*<\/p>/.test(bloco.replace(/escaparHtml\(chamado\.assunto\)/g, '')),
    'assunto no HTML do e-mail sem escape'
  );
});

test('exigeAtendimentoHumano: variações de "cancelar o plano/contrato" não escapam do filtro', opcoes, () => {
  const c = funcao();
  [
    'Quero cancelar o meu plano',
    'gostaria de cancelar a minha assinatura',
    'cancelamento do plano',
    'preciso cancelar o contrato',
    'cancelar nossa conta',
    'Cancelar todo o contrato',
  ].forEach((t) => assert.equal(c.exigeAtendimentoHumano(t, ''), true, t));
  [
    'cancelar um ciclo',
    'cancelar a avaliação do João',
    'cancelar a justificativa de falta',
    'como cancelo o convite?',
  ].forEach((t) => assert.equal(c.exigeAtendimentoHumano(t, ''), false, t));
});
