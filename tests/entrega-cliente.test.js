// =========================================================================
// Resultado enviado pelo candidato — a página (entrega.html), o painel do RH e o e-mail da etapa com o botão
// "Enviar meu resultado". Garantias: limites da página == limites da função; a página não vaza o código nem usa
// rastreadores; só Administrador/RH veem; o botão só entra com link https de verdade; mover de etapa cria o pedido e
// manda UM e-mail com o botão (e, se o pedido falhar, o e-mail sai sem o botão); a Auditoria só leva IDs.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const MB = 1024 * 1024;

// ======================= a página do candidato =======================
function paginaRegras() {
  const script = /<script>([\s\S]*?)<\/script>/.exec(ler('entrega.html'))[1];
  const ini = script.indexOf('// ---- Regras da entrega (testadas)');
  const fim = script.indexOf('// ---- fim: regras da entrega');
  assert.ok(ini >= 0 && fim > ini, 'marcadores das regras não encontrados na página');
  const ctx = vm.createContext({ Number, String, Math, Array, Object });
  vm.runInContext(
    script.slice(ini, fim) + '\nthis.__k = { LIMITE_ARQUIVOS, LIMITE_BYTES, MIN_BYTES, LIMITE_TEXTO, FORMATOS };',
    ctx
  );
  return ctx;
}

test('LIMITES DA PÁGINA == LIMITES DA FUNÇÃO: 3 arquivos, 5 MB, tamanho mínimo, 3000 caracteres e os 4 formatos', () => {
  const p = paginaRegras().__k;
  const fn = ler('supabase/functions/entrega-rs/index.ts');
  const num = (nome) =>
    Number(
      new RegExp(`const ${nome} = ([0-9 *]+);`)
        .exec(fn)[1]
        .split('*')
        .reduce((a, b) => a * Number(b), 1)
    );
  assert.equal(p.LIMITE_ARQUIVOS, num('ENTREGA_ARQUIVOS_MAX'));
  assert.equal(p.LIMITE_BYTES, num('ENTREGA_BYTES_MAX'));
  assert.equal(p.MIN_BYTES, num('ENTREGA_BYTES_MIN'));
  assert.equal(p.LIMITE_TEXTO, num('ENTREGA_TEXTO_MAX'));
  assert.deepEqual([p.LIMITE_ARQUIVOS, p.LIMITE_BYTES, p.LIMITE_TEXTO], [3, 5 * MB, 3000]);
  const mimesFn = Object.fromEntries(
    [...fn.matchAll(/'((?:application|image)\/[a-z]+)': '(\w+)'/g)].map((m) => [m[1], m[2]])
  );
  assert.deepEqual(plano(p.FORMATOS), mimesFn);
  assert.ok(ler('sql/43-entregas-rs.sql').includes(String(p.LIMITE_BYTES)), 'e o armazenamento tem o mesmo limite');
});

test('arquivo escolhido: aceita PDF/PNG/JPG/WEBP dentro do tamanho; recusa outros formatos, vazio e grande demais (fronteiras exatas)', () => {
  const c = paginaRegras();
  const v = (tipo, tamanho) => plano(c.validarArquivoEscolhido({ tipo, tamanho }));
  for (const t of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']) assert.equal(v(t, 1000).ok, true, t);
  for (const t of ['image/gif', 'image/heic', 'application/zip', 'text/html', 'application/msword', '', undefined])
    assert.equal(v(t, 1000).ok, false, String(t));
  assert.equal(v('application/pdf', 100).ok, true);
  assert.equal(v('application/pdf', 99).ok, false);
  assert.equal(v('application/pdf', 5 * MB).ok, true);
  assert.equal(v('application/pdf', 5 * MB + 1).ok, false);
  assert.match(v('application/pdf', 6 * MB).erro, /máximo é 5,0 MB/);
  assert.match(v('image/heic', 1000).erro, /tire um print/);
  assert.equal(plano(c.validarArquivoEscolhido(null)).ok, false);
});

test('no máximo 3 arquivos; o envio precisa de pelo menos um arquivo OU um texto', () => {
  const c = paginaRegras();
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((n) => c.podeAdicionarArquivo(n)),
    [true, true, true, false, false]
  );
  assert.equal(c.validarEnvio(0, '').ok, false);
  assert.equal(c.validarEnvio(0, '   ').ok, false);
  assert.equal(c.validarEnvio(0, null).ok, false);
  assert.equal(c.validarEnvio(1, '').ok, true);
  assert.equal(c.validarEnvio(0, 'Resultado: perfil D').ok, true);
  assert.match(c.validarEnvio(0, '').erro, /pelo menos um arquivo/);
  assert.equal(c.tamanhoTexto(2.5 * MB), '2,5 MB');
  assert.equal(c.tamanhoTexto(300 * 1024), '300 KB');
});

test('página do resultado: sem rastreadores, sem Referer, fora dos buscadores, com UMA biblioteca externa de versão FIXA', () => {
  const h = ler('entrega.html');
  assert.ok(
    /<meta name="referrer" content="no-referrer"/.test(h) && /<meta name="robots" content="noindex, nofollow"/.test(h)
  );
  const semComentarios = h
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/sentry|analytics|gtag|googletagmanager|hotjar|clarity\.ms|facebook\.net/i.test(semComentarios),
    'rastreador na página que carrega o código do link'
  );
  assert.deepEqual(
    [...h.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]),
    ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js']
  );
  assert.ok(!/supabase-js@(2|latest|\^|~)(\/|")/.test(h));
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(h) && !/\bsrc="https?:\/\/(?!cdn\.jsdelivr\.net)/.test(h));
});

test('página do resultado: o código só vai para a função; texto externo passa por esc(); fala com as ações certas e envia cada arquivo pelo caminho autorizado', () => {
  const h = ler('entrega.html');
  const fn = ler('supabase/functions/entrega-rs/index.ts');
  assert.ok(/\/\^\[A-Za-z0-9_-\]\{43\}\$\//.test(h) && /TOKEN_RE = \/\^\[A-Za-z0-9_-\]\{43\}\$\//.test(fn));
  for (const acao of ['candidato_entrega_abrir', 'candidato_entrega_preparar', 'candidato_entrega_confirmar'])
    assert.ok(h.includes(`'${acao}'`) && fn.includes(`'${acao}'`), acao);
  assert.ok(!/localStorage|sessionStorage|document\.cookie|document\.referrer|history\.(push|replace)State/.test(h));
  const html = [...h.matchAll(/innerHTML = `([\s\S]*?)`;/g)].map((m) => m[1]).join('\n');
  for (const d of [...html.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim()))
    assert.ok(
      /^(esc\(|mb\b|LIMITE_ARQUIVOS|LIMITE_TEXTO|icone|classe|dados\.instrucoes \?|i\b)|\?/.test(d) || /^esc\(/.test(d),
      `valor dinâmico em HTML sem esc(): \${${d}}`
    );
  assert.ok(
    h.includes('uploadToSignedUrl(envio.caminho, envio.token, alvo.file') && h.includes('window.onbeforeunload = null')
  );
  for (const t of [
    'Link inválido',
    'O prazo deste pedido terminou',
    'Este pedido foi cancelado',
    'Resultado já enviado',
    'Resultado enviado!',
  ])
    assert.ok(h.includes(t), t);
  assert.ok(/limites\.retencaoMeses/.test(h) && /não pode ser trocado/.test(h));
});

// ======================= o RH =======================
function ctx(papel = 'owner') {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/44-page-processo-seletivo.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
    'js/47-rs-cadastro.js',
    'js/48-rs-quadro.js',
    'js/49-rs-entrega.js',
    'js/50-rs-importacao.js',
  ]);
  c.meuPapelReal = papel;
  c.meuPerfilId = 'perfil1';
  c.URL = URL;
  c.location = { origin: 'https://site.com.br', pathname: '/Sistema-Norte/app.html' };
  c.__toasts = [];
  c.__renders = 0;
  c.__calls = [];
  c.__auditoria = [];
  c.__respostas = {};
  c.confirm = () => true;
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.sb = {
    functions: {
      invoke: async (nome, o) => {
        c.__calls.push({ nome, body: o.body });
        const r = c.__respostas[o.body.action];
        return typeof r === 'function' ? r(o.body) : (r ?? { data: {}, error: null });
      },
    },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ISO = (d) => new Date(d).toISOString();
const emails = (c) => c.__calls.filter((x) => x.nome === 'enviar-email').map((x) => x.body);
const solicitacoes = (c) => c.__calls.filter((x) => x.body.action === 'entrega_solicitar');
const PEDIDO_OK = {
  data: {
    ok: true,
    pedido: { id: 'ent1', prazo_ate: '2026-10-17T12:00:00Z' },
    link: 'https://site.com.br/Sistema-Norte/entrega.html?t=ABC',
    emailEnviado: false,
  },
  error: null,
};

function cenario(c, { etapa = 'disc_galt', entregas = [], vaga = {}, empresa = {}, email = 'ana@x.com' } = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = [];
    state.rs = { requisicoes: [${J({ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', ...vaga })}], configEtapas: ${J(empresa)},
      candidatos: [{ id: 'a', vagaId: 'v1', nome: 'Ana <b>Souza</b>', email: ${J(email)}, etapa: ${J(etapa)}, reprovado: false, historico: [], scorecards: [] }] };
    _rsEntregas = ${J(entregas)}; _rsEntregasErro = ''; _rsEntregasCarregando = false; _rsVideos = []; _rsCandidaturasPendentes = { v1: [] };
    for (const k of Object.keys(_rsEntregaLinks)) delete _rsEntregaLinks[k]; for (const k of Object.keys(_rsEntregaVista)) delete _rsEntregaVista[k];`
  );
}
const painel = (c) => rodar(c, 'entregaPainelRS(state.rs.candidatos[0], state.rs.requisicoes[0])');
const entrega = (extra) => ({
  id: 'ent1',
  candidato_ref: 'a',
  candidato_nome: 'Ana',
  candidato_email: 'ana@x.com',
  etapa: 'disc_galt',
  status: 'solicitado',
  prazo_ate: ISO('2026-10-17T12:00:00Z'),
  enviado_em: null,
  criado_em: ISO('2026-10-10T12:00:00Z'),
  qtd_arquivos: 0,
  tem_texto: false,
  ...extra,
});

test('só as etapas com teste/entrega têm o botão de resultado: DISC/GALT, teste lógico, prova teórica e prova prática', () => {
  const c = ctx();
  assert.deepEqual(plano(rodar(c, 'ETAPAS_COM_ENTREGA_RS')), [
    'disc_galt',
    'teste_logico',
    'prova_teorica',
    'prova_pratica',
  ]);
  assert.equal(rodar(c, "etapaTemEntregaRS('entrevista_fit')"), false);
  assert.equal(rodar(c, "etapaTemEntregaRS('prova_pratica')"), true);
});

// ---------- o botão no e-mail ----------
test('botão do e-mail: só com link https de verdade, escapado, com os limites e a validade; vazio se não houver link seguro', () => {
  const c = ctx();
  const b = (e) => rodar(c, `blocoEntregaEmailHtml(${J(e)})`);
  const h = b({ link: 'https://site.com.br/entrega.html?t=ABC&x=1', prazoISO: '2026-10-17T12:00:00Z' });
  assert.ok(h.includes('Enviar meu resultado') && h.includes('href="https://site.com.br/entrega.html?t=ABC&amp;x=1"'));
  assert.ok(
    h.includes('3 arquivos de 5 MB') && h.includes('não compartilhe') && /vale até \d{2}\/\d{2}\/\d{4}/.test(h)
  );
  for (const ruim of [
    undefined,
    null,
    {},
    { link: '' },
    { link: 'http://inseguro.com/e' },
    { link: 'javascript:alert(1)' },
    { link: 'https://u:s@golpe.com/x' },
    { link: 'https://x.com/"onmouseover="y' },
  ])
    assert.equal(b(ruim), '', J(ruim));
});

test('o e-mail da etapa traz o botão DEPOIS do passo a passo e das orientações; sem entrega, não traz', () => {
  const c = ctx();
  const m = (entrega) =>
    plano(
      rodar(
        c,
        `montarEmailEtapaRS(${J({ nome: 'Ana', nomeVaga: 'Vendedor', etapa: 'disc_galt', cfg: { instrucoes: 'Faça os dois testes', links: [{ rotulo: 'DISC', url: 'https://exemplo.com/disc' }] }, entrega })})`
      )
    );
  const h = m({ link: 'https://site.com.br/entrega.html?t=ABC', prazoISO: '2026-10-17T12:00:00Z' }).corpoHtml;
  const i = (t) => h.indexOf(t);
  assert.ok(
    i('<b>Como fazer:</b>') > 0 &&
      i('Faça os dois testes') > i('<b>Como fazer:</b>') &&
      i('href="https://exemplo.com/disc"') > i('Faça os dois testes') &&
      i('Enviar o resultado:') > i('href="https://exemplo.com/disc"')
  );
  assert.ok(!m(undefined).corpoHtml.includes('Enviar meu resultado'));
});

test('a pré-visualização mostra o botão nas 4 etapas com entrega e não nas outras', () => {
  const c = ctx();
  const p = (etapa) => rodar(c, `previaEmailEtapaRS(${J(etapa)}, 'Vendedor', {})`);
  for (const e of ['disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica'])
    assert.ok(p(e).includes('Enviar meu resultado'), e);
  for (const e of ['triagem', 'entrevista_fit', 'escolha']) assert.ok(!p(e).includes('Enviar meu resultado'), e);
});

// ---------- pedir o resultado ----------
test('pedir resultado: manda candidato, etapa, orientações DA VAGA e e-mail; prova prática usa o prazo da vaga; e-mail NÃO sai pela função (vai no e-mail da etapa)', async () => {
  const c = ctx();
  cenario(c, {
    etapa: 'prova_pratica',
    vaga: { etapasConfig: { prova_pratica: { instrucoes: 'Monte a proposta.', prazoDias: 5 } } },
  });
  c.__respostas.entrega_solicitar = PEDIDO_OK;
  const r = plano(await rodar(c, "pedirEntregaRS('a', 'prova_pratica')"));
  assert.deepEqual(
    [r.ok, r.link, r.prazoISO],
    [true, 'https://site.com.br/Sistema-Norte/entrega.html?t=ABC', '2026-10-17T12:00:00Z']
  );
  const req = solicitacoes(c)[0].body;
  assert.deepEqual(
    [
      req.candidato_ref,
      req.candidato_nome,
      req.candidato_email,
      req.etapa,
      req.instrucoes,
      req.validade_dias,
      req.enviar_email,
      req.url_base,
    ],
    [
      'a',
      'Ana <b>Souza</b>',
      'ana@x.com',
      'prova_pratica',
      'Monte a proposta.',
      5,
      false,
      'https://site.com.br/Sistema-Norte/',
    ]
  );
  assert.deepEqual(plano(c.__auditoria), [
    ['rs.entrega_solicitada', { candidatoId: 'a', pedidoId: 'ent1', etapa: 'prova_pratica' }],
  ]);
});

test('pedir resultado: nas outras etapas a validade é a padrão; quem já enviou volta "jaEnviado" sem link; erro do servidor volta o motivo; resposta estranha é tratada como falha', async () => {
  const c = ctx();
  cenario(c, {});
  c.__respostas.entrega_solicitar = PEDIDO_OK;
  await rodar(c, "pedirEntregaRS('a', 'disc_galt')");
  assert.equal(solicitacoes(c)[0].body.validade_dias, undefined);
  c.__respostas.entrega_solicitar = {
    data: null,
    error: {
      message: 'x',
      context: { json: async () => ({ error: 'Este candidato já enviou o resultado desta etapa.', jaEnviado: true }) },
    },
  };
  const j = plano(await rodar(c, "pedirEntregaRS('a', 'disc_galt')"));
  assert.deepEqual([j.ok, j.jaEnviado, j.link], [false, true, undefined]);
  c.__respostas.entrega_solicitar = { data: { ok: true }, error: null };
  assert.equal(
    plano(await rodar(c, "pedirEntregaRS('a', 'disc_galt')")).ok,
    false,
    'sem pedido nem link na resposta: falha, sem estourar erro'
  );
  assert.equal(plano(await rodar(c, "pedirEntregaRS('nada', 'disc_galt')")).ok, false);
});

// ---------- mover de etapa ----------
test('mover para uma etapa com entrega cria o pedido e manda UM e-mail com o botão "Enviar meu resultado"', async () => {
  for (const etapa of ['disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica']) {
    const c = ctx('owner');
    cenario(c, {
      etapa: 'triagem',
      empresa: {
        disc_galt: { instrucoes: 'x', links: [] },
        teste_logico: { instrucoes: 'x', links: [] },
        prova_teorica: { instrucoes: 'x', links: [] },
      },
      vaga: { etapasConfig: { prova_pratica: { instrucoes: 'Monte.', prazoDias: 3 } } },
    });
    c.__respostas.entrega_solicitar = PEDIDO_OK;
    c.__respostas.entrega_listar = { data: { entregas: [] }, error: null };
    rodar(c, `moverEtapaCandidatoRS('a', ${J(etapa)})`);
    await esperar(60);
    assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), etapa);
    assert.equal(solicitacoes(c).length, 1, etapa);
    const e = emails(c);
    assert.equal(e.length, 1, `${etapa}: um e-mail só`);
    assert.ok(
      e[0].corpoHtml.includes('Enviar meu resultado') &&
        e[0].corpoHtml.includes('entrega.html?t=ABC') &&
        e[0].corpoHtml.includes('<b>Como fazer:</b>'),
      etapa
    );
    assert.equal(e[0].destinatario, 'ana@x.com');
    assert.ok(c.__toasts.some((t) => t.includes('com o botão para enviar o resultado')));
  }
});

test('se o pedido FALHAR, o e-mail da etapa sai mesmo assim (sem o botão) e o RH é avisado; se o candidato já enviou, sai sem botão e sem alarme', async () => {
  const c = ctx('owner');
  cenario(c, { etapa: 'triagem', empresa: { disc_galt: { instrucoes: 'x', links: [] } } });
  c.__respostas.entrega_solicitar = { data: null, error: { message: 'Function not found' } };
  rodar(c, "moverEtapaCandidatoRS('a', 'disc_galt')");
  await esperar(60);
  assert.equal(emails(c).length, 1);
  assert.ok(!emails(c)[0].corpoHtml.includes('Enviar meu resultado'));
  assert.ok(c.__toasts.some((t) => t.includes('não foi criado') && t.includes('sem o botão')));
  const j = ctx('owner');
  cenario(j, { etapa: 'triagem', empresa: { disc_galt: { instrucoes: 'x', links: [] } } });
  j.__respostas.entrega_solicitar = {
    data: null,
    error: { message: 'x', context: { json: async () => ({ error: 'já enviou', jaEnviado: true }) } },
  };
  rodar(j, "moverEtapaCandidatoRS('a', 'disc_galt')");
  await esperar(60);
  assert.equal(emails(j).length, 1);
  assert.ok(
    !emails(j)[0].corpoHtml.includes('Enviar meu resultado') && !j.__toasts.some((t) => t.includes('não foi criado'))
  );
});

test('quem não é Administrador/RH movendo candidato recebe só o e-mail normal da etapa; etapas sem entrega não criam pedido', async () => {
  const lider = ctx('lider');
  cenario(lider, { etapa: 'triagem', empresa: { disc_galt: { instrucoes: 'x', links: [] } } });
  rodar(lider, "moverEtapaCandidatoRS('a', 'disc_galt')");
  await esperar(40);
  assert.equal(solicitacoes(lider).length, 0);
  assert.equal(emails(lider).length, 1);
  assert.ok(!emails(lider)[0].corpoHtml.includes('Enviar meu resultado'));
  const c = ctx('owner');
  for (const etapa of ['entrevista_fit', 'entrevista_final', 'escolha', 'proposta']) {
    cenario(c, { etapa: 'triagem' });
    rodar(c, `moverEtapaCandidatoRS('a', ${J(etapa)})`);
  }
  await esperar(40);
  assert.equal(solicitacoes(c).length, 0);
});

test('o botão Avançar do quadro leva ao mesmo fluxo (próxima etapa com entrega cria o pedido)', async () => {
  const c = ctx('owner');
  cenario(c, {
    etapa: 'nova',
    vaga: { etapasAtivas: ['disc_galt'] },
    empresa: { disc_galt: { instrucoes: 'x', links: [] } },
  });
  c.__respostas.entrega_solicitar = PEDIDO_OK;
  c.__respostas.entrega_listar = { data: { entregas: [] }, error: null };
  rodar(c, "avancarCandidatoRS('a')");
  await esperar(60);
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'disc_galt');
  assert.equal(solicitacoes(c).length, 1);
  assert.ok(emails(c)[0].corpoHtml.includes('Enviar meu resultado'));
});

// ---------- o painel na ficha ----------
test('o painel só aparece para Administrador/RH e só consulta o servidor quando pode mostrar', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, { entregas: [entrega()] });
    assert.equal(painel(c), '', String(papel));
    assert.equal(c.__calls.length, 0);
  }
  assert.ok(
    painel(
      (() => {
        const c = ctx('rh');
        cenario(c, { entregas: [entrega()] });
        return c;
      })()
    ).includes('Resultados enviados pelo candidato')
  );
});

test('painel: carrega a lista UMA vez; falha mostra o motivo e não fica tentando', async () => {
  const c = ctx();
  cenario(c, {});
  rodar(c, '_rsEntregas = null;');
  c.__respostas.entrega_listar = { data: { entregas: [] }, error: null };
  assert.ok(painel(c).includes('Carregando'));
  painel(c);
  painel(c);
  await esperar();
  assert.equal(c.__calls.filter((x) => x.body.action === 'entrega_listar').length, 1);
  const f = ctx();
  cenario(f, {});
  rodar(f, '_rsEntregas = null;');
  f.__respostas.entrega_listar = { data: null, error: { message: 'Function not found' } };
  painel(f);
  await esperar();
  assert.ok(painel(f).includes('Não foi possível carregar os resultados agora'));
  const antes = f.__calls.length;
  painel(f);
  await esperar();
  assert.equal(f.__calls.length, antes);
});

test('painel por situação: aguardando, enviado, vencido e cancelado mostram os botões certos; o link do candidato aparece uma vez', () => {
  const c = ctx();
  cenario(c, { entregas: [entrega()] });
  rodar(c, "_rsEntregaLinks.ent1 = 'https://s/entrega.html?t=ABC&x=<b>';");
  let h = painel(c);
  assert.ok(
    h.includes('Teste DISC e GALT') &&
      h.includes('Aguardando o candidato') &&
      h.includes('Reenviar link') &&
      h.includes('Cancelar pedido') &&
      h.includes('link válido até')
  );
  assert.ok(h.includes('Link do candidato') && h.includes('&amp;x=&lt;b&gt;') && !h.includes('x=<b>'));
  cenario(c, {
    entregas: [
      entrega({ status: 'enviado', enviado_em: ISO('2026-10-12T12:00:00Z'), qtd_arquivos: 2, tem_texto: true }),
    ],
  });
  h = painel(c);
  assert.ok(
    h.includes('Resultado enviado') &&
      h.includes('2 arquivo(s)') &&
      h.includes('com texto') &&
      h.includes('Ver resultado') &&
      h.includes('Excluir') &&
      !h.includes('Reenviar link')
  );
  cenario(c, { entregas: [entrega({ status: 'expirado' })] });
  h = painel(c);
  assert.ok(h.includes('Prazo vencido') && h.includes('Reenviar link') && !h.includes('Cancelar pedido'));
  cenario(c, { entregas: [entrega({ status: 'cancelado' })] });
  assert.ok(painel(c).includes('Pedido cancelado'));
});

test('mostra os resultados de TODAS as etapas do candidato (inclusive de etapas anteriores) e oferece "Pedir agora" quando está numa etapa com entrega e sem pedido', () => {
  const c = ctx();
  cenario(c, {
    etapa: 'entrevista_fit',
    entregas: [
      entrega({ status: 'enviado', qtd_arquivos: 1 }),
      entrega({ id: 'ent2', etapa: 'prova_pratica', status: 'cancelado' }),
    ],
  });
  const h = painel(c);
  assert.ok(h.includes('Teste DISC e GALT') && h.includes('Prova prática'));
  assert.ok(!h.includes('Pedir o resultado de'), 'numa etapa sem entrega não oferece pedir');
  cenario(c, { etapa: 'teste_logico', entregas: [] });
  const vazio = painel(c);
  assert.ok(
    vazio.includes('Pedir o resultado de &quot;Teste lógico&quot; agora') ||
      vazio.includes('Pedir o resultado de "Teste lógico" agora')
  );
  assert.ok(vazio.includes("pedirEntregaAgoraRS('a', 'teste_logico')"));
  cenario(c, { etapa: 'entrevista_fit', entregas: [] });
  assert.equal(painel(c), '', 'sem resultados e sem pedido a fazer: nada a mostrar');
});

test('ver o resultado: texto e arquivos escapados, só links https, Auditoria só com o ID; falha mostra o motivo', async () => {
  const c = ctx();
  cenario(c, { entregas: [entrega({ status: 'enviado', qtd_arquivos: 2, tem_texto: true })] });
  c.__respostas.entrega_ver = {
    data: {
      ok: true,
      texto: 'Perfil <img src=x onerror=alert(1)>',
      arquivos: [
        { nome: 'print <b>1</b>.png', mime: 'image/png', tamanho: 300 * 1024, url: 'https://s/f?token="><script>' },
        { nome: 'golpe.pdf', mime: 'application/pdf', tamanho: 1024, url: 'javascript:alert(1)' },
      ],
    },
    error: null,
  };
  await rodar(c, "verEntregaRS('ent1')");
  assert.deepEqual(plano(c.__auditoria), [['rs.entrega_vista', { pedidoId: 'ent1' }]]);
  const h = painel(c);
  assert.ok(
    !h.includes('<img src=x') && !h.includes('<script>') && !h.includes('<b>1</b>') && !h.includes('javascript:')
  );
  assert.ok(h.includes('300 KB') && h.includes('Links temporários (10 minutos)'));
  rodar(c, "fecharEntregaVistaRS('ent1')");
  assert.ok(!painel(c).includes('Links temporários'));
  c.__respostas.entrega_ver = {
    data: null,
    error: { message: 'x', context: { json: async () => ({ error: 'Este candidato ainda não enviou o resultado.' }) } },
  };
  await rodar(c, "verEntregaRS('ent1')");
  assert.ok(c.__toasts.some((t) => t.includes('ainda não enviou')));
});

test('reenviar, cancelar e excluir: reenviar guarda o link novo; cancelar e excluir pedem confirmação; a Auditoria nunca leva nome, e-mail ou link', async () => {
  const c = ctx();
  cenario(c, { entregas: [entrega()] });
  c.__respostas.entrega_reenviar = {
    data: { ok: true, link: 'https://s/entrega.html?t=SEGREDO2', emailEnviado: true },
    error: null,
  };
  c.__respostas.entrega_cancelar = { data: { ok: true }, error: null };
  c.__respostas.entrega_excluir = { data: { ok: true }, error: null };
  c.__respostas.entrega_listar = { data: { entregas: [entrega()] }, error: null };
  await rodar(c, "reenviarEntregaRS('ent1')");
  assert.equal(c.__calls.find((x) => x.body.action === 'entrega_reenviar').body.enviar_email, true);
  assert.equal(rodar(c, '_rsEntregaLinks.ent1'), 'https://s/entrega.html?t=SEGREDO2');
  const n = c.__calls.length;
  c.confirm = () => false;
  await rodar(c, "cancelarEntregaRS('ent1')");
  await rodar(c, "excluirEntregaRS('ent1')");
  assert.equal(c.__calls.length, n, 'recusou a confirmação: nenhuma chamada');
  c.confirm = () => true;
  await rodar(c, "cancelarEntregaRS('ent1')");
  await rodar(c, "excluirEntregaRS('ent1')");
  assert.deepEqual(plano(c.__auditoria.map((x) => x[0])), [
    'rs.entrega_link_reenviado',
    'rs.entrega_cancelada',
    'rs.entrega_excluida',
  ]);
  const texto = JSON.stringify(c.__auditoria);
  for (const proibido of ['Ana', 'Souza', 'ana@x.com', 'SEGREDO', 'http'])
    assert.ok(!texto.includes(proibido), `a auditoria vazou "${proibido}"`);
});

// ---------- ficha, faixa e exclusão da pessoa ----------
test('a ficha do candidato mostra o painel dos resultados; a faixa "Para você fazer agora" conta os resultados enviados', () => {
  const c = ctx('owner');
  cenario(c, { etapa: 'disc_galt', entregas: [entrega({ status: 'enviado', qtd_arquivos: 1 })] });
  rodar(c, "_psFichaAberta = 'a'");
  assert.ok(rodar(c, 'quadroDaVagaHtml(state.rs.requisicoes[0])').includes('Resultados enviados pelo candidato'));
  const faixa = rodar(c, 'faixaPendenciasHtml(true)');
  assert.ok(
    faixa.includes('1 resultado(s) enviado(s) pelo candidato') &&
      faixa.includes("resolverPendenciaRS('resultados', 'v1')")
  );
  const acoes = plano(
    rodar(
      c,
      "acoesPendentesRS({ requisicoes: [{ id: 'v1', status: 'aprovada', etapasAtivas: ['triagem'] }], candidatos: [{ id: 'a', vagaId: 'v1', etapa: 'disc_galt' }], videos: [], entregas: [{ candidato_ref: 'a', status: 'enviado' }, { candidato_ref: 'a', status: 'solicitado' }], candidaturasPendentes: {}, vagaSelecionadaId: null, gestor: true })"
    )
  );
  assert.deepEqual(
    acoes.map((a) => [a.chave, a.total]),
    [['resultados', 1]]
  );
});

test('excluir a pessoa do cadastro é BLOQUEADO enquanto houver resultado enviado (os arquivos ficariam órfãos)', () => {
  const c = ctx('owner');
  cenario(c, { entregas: [entrega({ status: 'enviado' })] });
  rodar(c, "removerPessoaRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 1);
  assert.ok(c.__toasts.some((t) => t.includes('enviou resultados')));
  cenario(c, { entregas: [entrega({ status: 'cancelado' })] });
  rodar(c, "removerPessoaRS('a')");
  assert.equal(rodar(c, 'state.rs.candidatos.length'), 0, 'pedido cancelado não segura a exclusão');
});

test('integração: o módulo do RH só chama ações que a função trata; não toca no armazenamento; está no app', () => {
  const fn = ler('supabase/functions/entrega-rs/index.ts');
  const js = ler('js/49-rs-entrega.js');
  const usadas = [...js.matchAll(/chamarEntregaRS\('(entrega_\w+)'/g)].map((m) => m[1]);
  assert.ok(usadas.length >= 6);
  for (const a of new Set(usadas)) assert.ok(fn.includes(`action === '${a}'`), `a função não trata ${a}`);
  assert.ok(
    !/\.storage\b|from\('rs_entregas'\)/.test(js),
    'o navegador do RH não pode ler o armazenamento nem as tabelas'
  );
  assert.ok(ler('app.html').includes('js/49-rs-entrega.js'));
  assert.ok(/ETAPAS_COM_ENTREGA_RS\.includes\(novaEtapa\) && rsEntregaHabilitado\(\)/.test(ler('js/40-page-rs.js')));
});
