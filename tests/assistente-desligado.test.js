// =========================================================================
// Assistente de IA da Central de Ajuda DESLIGADO (padrão): a Central fica só com o FAQ e os
// chamados respondidos pela equipe — sem custo de API e sem texto de cliente saindo do sistema.
// Testa o comportamento nos DOIS modos (desligado e ligado), as duas travas (site e servidor)
// e a coerência com a Política de Privacidade e os Termos.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

// Carrega js/02 + js/41 numa caixa de areia, com o interruptor no valor pedido e um app falso por perto.
function central(ligado) {
  let fonte = ler('js/41-page-central-ajuda.js');
  assert.ok(/const ASSISTENTE_IA_VISIVEL = (true|false);/.test(fonte));
  fonte = fonte.replace(/const ASSISTENTE_IA_VISIVEL = (true|false);/, `const ASSISTENTE_IA_VISIVEL = ${ligado};`);
  const chamadas = [];
  const toasts = [];
  const campos = {
    cha_assunto: { value: 'Como convido alguém?' },
    cha_mensagem: { value: 'Preciso dar acesso ao novo RH.' },
  };
  const ctx = {
    console,
    state: { empresa: { nomeFantasia: 'Loja X' }, configuracoes: {} },
    document: {
      getElementById: (id) => campos[id] || null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {} }),
    },
    window: {},
    location: { origin: '', pathname: '/' },
    empresaIdAtual: 'e1',
    meuPerfilId: 'p1',
    _perfisEmpresa: [{ id: 'p1', nome: 'Ana', email: 'ana@x.com' }],
    sessaoAtual: null,
    sb: {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: '3f2b8c1e-9a4d-4e1b-8c7a-1d2e3f4a5b6c' }, error: null }),
          }),
        }),
        select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }),
      }),
      functions: {
        invoke: async (nome, opcoes) => {
          chamadas.push({ nome, ...opcoes.body });
          return { data: nome === 'chamado-automatico' ? { resultado: 'humano' } : {}, error: null };
        },
      },
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const arq of ['js/02-core-helpers.js']) vm.runInContext(ler(arq), ctx, { filename: arq });
  vm.runInContext(fonte, ctx, { filename: 'js/41-page-central-ajuda.js' });
  // Substitutos do app (aplicados DEPOIS de carregar os arquivos, senão os de verdade sobrescrevem estes).
  Object.assign(ctx, {
    showToast: (t) => toasts.push(t),
    render: () => {},
    registrarAuditoria: () => {},
    mensagemDeErroFuncao: async () => '',
  });
  ctx.__chamadas = chamadas;
  ctx.__toasts = toasts;
  return ctx;
}

function paginaDe(ligado) {
  const c = central(ligado);
  vm.runInContext('_chamadosCarregados = true; _chamadosEmpresa = [];', c);
  return { c, html: vm.runInContext('pageCentralAjuda()', c) };
}

// ---------- padrão ----------
test('o assistente de IA está DESLIGADO por padrão, no site e no servidor', () => {
  assert.ok(ler('js/41-page-central-ajuda.js').includes('const ASSISTENTE_IA_VISIVEL = false;'));
  for (const f of ['assistente-ajuda', 'chamado-automatico']) {
    assert.ok(
      ler(`supabase/functions/${f}/index.ts`).includes("Deno.env.get('ASSISTENTE_AJUDA_ATIVO') !== 'true'"),
      `${f} não exige ASSISTENTE_AJUDA_ATIVO=true`
    );
  }
});

// ---------- tela: desligado ----------
test('desligado: a Central mostra FAQ e chamados — sem o chat, sem "pergunte ao assistente" e sem a pergunta sobre "Respondido (IA)"', () => {
  const { html } = paginaDe(false);
  assert.ok(
    html.includes('Perguntas frequentes') && html.includes('Meus chamados') && html.includes('Abrir novo chamado')
  );
  assert.ok(html.includes('Solicitar meus dados (LGPD)'), 'o canal de LGPD continua');
  assert.ok(!/assistente/i.test(html.replace(/Instituto INETRIS/g, '')), 'a tela ainda cita o assistente');
  assert.ok(!html.includes('Respondido (IA)'));
  assert.ok(html.includes('Abra um chamado abaixo'));
});

test('desligado: as sugestões do chamado não usam a pergunta que só vale com a IA', () => {
  const c = central(false);
  const exibidas = vm.runInContext('faqExibido()', c).map((f) => f.p);
  assert.ok(!exibidas.some((p) => p.includes('Respondido (IA)')));
  assert.ok(exibidas.length >= 15, 'o FAQ continua completo');
  const sugestoes = vm.runInContext('faqSugestoes("o que significa respondido pela ia no chamado")', c).map((i) => i.p);
  assert.ok(!sugestoes.some((p) => p.includes('Respondido (IA)')));
});

// ---------- tela: ligado (volta tudo) ----------
test('ligado: o chat, a pergunta sobre "Respondido (IA)" e o texto com o assistente voltam', () => {
  const { html, c } = paginaDe(true);
  assert.ok(/assistente/i.test(html));
  assert.ok(html.includes('Pergunte ao assistente acima'));
  assert.ok(vm.runInContext('faqExibido()', c).some((f) => f.p.includes('Respondido (IA)')));
});

// ---------- abertura do chamado ----------
test('desligado: abrir um chamado NÃO aciona a IA — vai direto pra equipe, e o e-mail de confirmação não promete assistente', async () => {
  const c = central(false);
  await vm.runInContext('enviarChamadoSuporte()', c);
  const nomes = c.__chamadas.map((x) => x.nome);
  assert.ok(!nomes.includes('chamado-automatico'), 'chamou a função de IA com o assistente desligado');
  assert.ok(!nomes.includes('assistente-ajuda'));
  const emails = c.__chamadas.filter((x) => x.nome === 'enviar-email');
  assert.equal(emails.length, 2, 'avisa a equipe e confirma ao cliente');
  const confirmacao = emails.find((e) => e.destinatario === 'ana@x.com');
  assert.ok(confirmacao.corpoHtml.includes('perguntas frequentes') && !/assistente/i.test(confirmacao.corpoHtml));
  assert.ok(c.__toasts.some((t) => t.includes('Nossa equipe responde em breve')));
  assert.ok(!c.__toasts.some((t) => /automaticamente|analisando/i.test(t)));
});

test('ligado: abrir um chamado aciona a resposta automática (o caminho antigo continua funcionando)', async () => {
  const c = central(true);
  await vm.runInContext('enviarChamadoSuporte()', c);
  const proc = c.__chamadas.find((x) => x.nome === 'chamado-automatico');
  assert.ok(proc && proc.action === 'processar' && proc.chamadoId === '3f2b8c1e-9a4d-4e1b-8c7a-1d2e3f4a5b6c');
  const confirmacao = c.__chamadas.find((x) => x.nome === 'enviar-email' && x.destinatario === 'ana@x.com');
  assert.ok(/assistente/i.test(confirmacao.corpoHtml));
});

test('abrir o chamado continua exigindo assunto e mensagem (nada muda no formulário)', async () => {
  const c = central(false);
  c.document.getElementById = (id) => ({ value: id === 'cha_assunto' ? '' : 'texto' });
  await vm.runInContext('enviarChamadoSuporte()', c);
  assert.equal(c.__chamadas.length, 0);
  assert.ok(c.__toasts.some((t) => t.includes('Preencha o assunto')));
});

// ---------- servidor ----------
test('servidor: a chave ANTHROPIC_API_KEY sozinha NÃO liga o assistente (ela também serve à leitura de folha de ponto)', () => {
  const a = ler('supabase/functions/assistente-ajuda/index.ts');
  assert.ok(
    a.indexOf("'ASSISTENTE_AJUDA_ATIVO') !== 'true'") < a.indexOf('if (!ANTHROPIC_API_KEY)'),
    'o interruptor precisa vir ANTES da checagem da chave'
  );
  assert.ok(
    a.indexOf("'ASSISTENTE_AJUDA_ATIVO') !== 'true'") < a.indexOf('await perguntarAoClaude('),
    'o interruptor precisa vir ANTES de chamar a IA'
  );
  assert.ok(a.includes('desativado: true') && a.includes('503'));
  assert.ok(
    ler('supabase/functions/folha-ponto/index.ts').includes('ANTHROPIC_API_KEY'),
    'a folha de ponto continua usando a mesma chave, sem depender do interruptor do assistente'
  );
  assert.ok(!ler('supabase/functions/folha-ponto/index.ts').includes('ASSISTENTE_AJUDA_ATIVO'));
});

test('servidor: com a IA desligada, o chamado fica "aberto" pra equipe antes de qualquer reserva ou chamada à IA', () => {
  const c = ler('supabase/functions/chamado-automatico/index.ts');
  const iSwitch = c.indexOf(
    "'ASSISTENTE_AJUDA_ATIVO') !== 'true') return jsonResponse({ ok: true, resultado: 'humano', motivo: 'ia_desativada' }"
  );
  assert.ok(iSwitch > 0, 'faltou o interruptor na ação processar');
  assert.ok(iSwitch < c.indexOf(".eq('ia_tentativas', 0)"), 'a tentativa não pode ser gasta com a IA desligada');
  assert.ok(iSwitch < c.indexOf('/functions/v1/assistente-ajuda'));
});

test('a rotina de chamados continua útil com a IA desligada: lembra a equipe de chamado parado', () => {
  const c = ler('supabase/functions/chamado-automatico/index.ts');
  assert.ok(c.includes('precisaLembrete(c, agora, HORAS_LEMBRETE)'));
  assert.ok(c.includes("action === 'rotina'"));
});

// ---------- coerência com os documentos legais ----------
test('Política de Privacidade e Termos só falam do assistente de IA se ele estiver LIGADO (nunca prometer/avisar o que não existe)', () => {
  const ligado = /const ASSISTENTE_IA_VISIVEL = true;/.test(ler('js/41-page-central-ajuda.js'));
  const priv = ler('privacidade.html').toLowerCase();
  const termos = ler('termos.html').toLowerCase();
  for (const trecho of ['assistente de ajuda', 'assistente automático', 'respostas automáticas a chamados']) {
    assert.equal(
      priv.includes(trecho),
      ligado,
      `privacidade.html ${ligado ? 'deveria' : 'não deveria'} citar "${trecho}"`
    );
    assert.equal(
      termos.includes(trecho),
      ligado,
      `termos.html ${ligado ? 'deveria' : 'não deveria'} citar "${trecho}"`
    );
  }
  // a Anthropic continua citada: ela ainda é usada pela leitura de folha de ponto por foto
  assert.ok(priv.includes('anthropic') && priv.includes('folha de ponto'));
});

test('a documentação explica as duas travas e a pergunta da Política vale pro recurso que ainda usa IA', () => {
  const doc = ler('docs/ASSISTENTE-IA.md');
  assert.ok(
    doc.includes('ASSISTENTE_IA_VISIVEL') && doc.includes('ASSISTENTE_AJUDA_ATIVO') && doc.includes('ANTHROPIC_API_KEY')
  );
  assert.ok(doc.includes('DESLIGADO'));
  assert.ok(ler('docs/CI-E-IMPLANTACAO.md').includes('`ASSISTENTE_AJUDA_ATIVO`'));
});
