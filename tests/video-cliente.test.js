// =========================================================================
// Vídeo de apresentação — lado do candidato (video.html) e do RH (painel no funil).
// Garantias: limites da página == limites da função (2 min, 40 MB, formatos); a página não vaza o código do
// link nem usa rastreadores; o painel do RH só aparece para Administrador/RH e só em vaga que usa a etapa;
// mover o candidato para a etapa de vídeo cria o pedido (e não manda o aviso genérico); nada de dado
// pessoal na Auditoria; textos vindos do servidor ou do candidato saem escapados.
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
  const html = ler('video.html');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const ini = script.indexOf('// ---- Regras do vídeo (testadas)');
  const fim = script.indexOf('// ---- fim: regras do vídeo');
  assert.ok(ini >= 0 && fim > ini, 'marcadores das regras não encontrados na página');
  const ctx = vm.createContext({ Number, String, Math, Array, Object });
  vm.runInContext(
    script.slice(ini, fim) + '\nthis.__k = { LIMITE_SEGUNDOS, LIMITE_BYTES, MIN_BYTES, FORMATOS, BITS_VIDEO };',
    ctx
  );
  return ctx;
}

test('LIMITES DA PÁGINA == LIMITES DA FUNÇÃO: 2 minutos, 40 MB, tamanho mínimo e os 3 formatos (não saem de sincronia)', () => {
  const p = paginaRegras().__k;
  const fn = ler('supabase/functions/video-rs/index.ts');
  const num = (nome) =>
    Number(
      new RegExp(`const ${nome} = ([0-9 *]+);`)
        .exec(fn)[1]
        .split('*')
        .reduce((a, b) => a * Number(b), 1)
    );
  assert.equal(p.LIMITE_SEGUNDOS, num('VIDEO_SEGUNDOS_MAX'));
  assert.equal(p.LIMITE_BYTES, num('VIDEO_BYTES_MAX'));
  assert.equal(p.MIN_BYTES, 10 * 1024);
  assert.equal(p.LIMITE_SEGUNDOS, 120);
  assert.equal(p.LIMITE_BYTES, 40 * MB);
  const mimesFn = Object.fromEntries([...fn.matchAll(/'(video\/[a-z0-9]+)': '(\w+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(plano(p.FORMATOS), mimesFn);
});

test('a gravação pela página usa ~1 Mbps: 2 minutos cabem folgadamente nos 40 MB', () => {
  const p = paginaRegras().__k;
  const bytesEmDoisMinutos = ((p.BITS_VIDEO + 64000) / 8) * p.LIMITE_SEGUNDOS;
  assert.ok(
    bytesEmDoisMinutos < p.LIMITE_BYTES / 2,
    `2 min gravados ficariam em ${(bytesEmDoisMinutos / MB).toFixed(1)} MB`
  );
});

test('arquivo escolhido: aceita MP4/WebM/MOV dentro do tamanho; recusa outros formatos, vazio e grande demais (fronteiras exatas)', () => {
  const c = paginaRegras();
  const v = (tipo, tamanho) => plano(c.validarArquivoEscolhido({ tipo, tamanho }));
  assert.equal(v('video/mp4', 5 * MB).ok, true);
  assert.equal(v('video/webm;codecs=vp9', 5 * MB).mime, 'video/webm');
  assert.equal(v('video/quicktime', 5 * MB).ok, true);
  for (const tipo of ['image/png', 'application/pdf', 'video/x-msvideo', '', undefined])
    assert.equal(v(tipo, 5 * MB).ok, false, String(tipo));
  assert.equal(v('video/mp4', 10 * 1024).ok, true);
  assert.equal(v('video/mp4', 10 * 1024 - 1).ok, false);
  assert.equal(v('video/mp4', 40 * MB).ok, true);
  assert.equal(v('video/mp4', 40 * MB + 1).ok, false);
  assert.match(v('video/mp4', 41 * MB).erro, /máximo é 40,0 MB/);
  assert.match(v('video/mp4', 41 * MB).erro, /Grave o vídeo pela própria página/);
  assert.equal(plano(c.validarArquivoEscolhido(null)).ok, false);
});

test('duração: até 2:00 passa (com 0,5 s de folga); acima, ilegível, zero ou infinita não passam', () => {
  const c = paginaRegras();
  const d = (x) => plano(c.validarDuracao(x));
  assert.deepEqual(d(60), { ok: true, segundos: 60 });
  assert.equal(d(120).ok, true);
  assert.equal(d(120.5).ok, true);
  assert.equal(d(120.6).ok, false);
  assert.match(d(150).erro, /02:30.*máximo é 02:00/);
  for (const ruim of [0, -5, NaN, Infinity, 'abc', undefined, null]) assert.equal(d(ruim).ok, false, String(ruim));
});

test('a gravação para sozinha aos 2 minutos: o relógio conta de 120 a 0 e nunca fica negativo', () => {
  const c = paginaRegras();
  const r = (ms) => c.segundosRestantes(1000, 1000 + ms);
  assert.equal(r(0), 120);
  assert.equal(r(500), 120);
  assert.equal(r(1000), 119);
  assert.equal(r(60000), 60);
  assert.equal(r(119500), 1);
  assert.equal(r(120000), 0);
  assert.equal(r(500000), 0);
});

test('formato de gravação: prefere WebM VP9, depois VP8, WebM genérico e por fim MP4 (Safari); sem suporte devolve vazio', () => {
  const c = paginaRegras();
  const f = (suportados) => c.escolherFormatoGravacao((t) => suportados.includes(t));
  assert.equal(f(['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']), 'video/webm;codecs=vp9,opus');
  assert.equal(f(['video/webm;codecs=vp8,opus', 'video/mp4']), 'video/webm;codecs=vp8,opus');
  assert.equal(f(['video/webm']), 'video/webm');
  assert.equal(f(['video/mp4']), 'video/mp4');
  assert.equal(f([]), '');
});

test('textos de tempo e tamanho', () => {
  const c = paginaRegras();
  assert.equal(c.tempoTexto(0), '00:00');
  assert.equal(c.tempoTexto(95), '01:35');
  assert.equal(c.tempoTexto(120), '02:00');
  assert.equal(c.tamanhoTexto(18.5 * MB), '18,5 MB');
  assert.equal(c.tamanhoTexto(300 * 1024), '300 KB');
  assert.equal(c.tamanhoTexto(10), '1 KB');
});

test('página do vídeo: sem rastreadores, sem Referer, fora dos buscadores, com UMA biblioteca externa de versão FIXA', () => {
  const h = ler('video.html');
  assert.ok(
    /<meta name="referrer" content="no-referrer"/.test(h) && /<meta name="robots" content="noindex, nofollow"/.test(h)
  );
  assert.ok(
    !/sentry|analytics|gtag|googletagmanager|hotjar|clarity\.ms|facebook\.net/i.test(
      h
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    ),
    'rastreador na página que carrega o código do link'
  );
  const externos = [...h.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(externos, ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js']);
  assert.ok(!/supabase-js@(2|latest|\^|~)(\/|")/.test(h), 'versão da biblioteca precisa ser exata');
  assert.ok(
    !/<link[^>]+rel="stylesheet"/.test(h) && !/\bsrc="https?:\/\/(?!cdn\.jsdelivr\.net)/.test(h),
    'nada de recursos de outros sites'
  );
});

test('página do vídeo: o código do link só vai para a função; texto do servidor passa por esc(); fala com as ações certas', () => {
  const h = ler('video.html');
  const fn = ler('supabase/functions/video-rs/index.ts');
  assert.ok(
    /\/\^\[A-Za-z0-9_-\]\{43\}\$\//.test(h) && /TOKEN_RE = \/\^\[A-Za-z0-9_-\]\{43\}\$\//.test(fn),
    'mesmo formato de código nos dois lados'
  );
  for (const acao of ['candidato_video_abrir', 'candidato_video_preparar', 'candidato_video_confirmar'])
    assert.ok(h.includes(`'${acao}'`) && fn.includes(`'${acao}'`), acao);
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(h), 'o código não pode ser guardado no navegador');
  assert.ok(!/history\.(push|replace)State|document\.referrer/.test(h));
  const html = [...h.matchAll(/innerHTML = `([\s\S]*?)`;/g)].map((m) => m[1]).join('\n');
  const dinamicos = [...html.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
  for (const d of dinamicos)
    assert.ok(
      /^(esc\(|podeGravar|mb\b|gravado|mensagem|classe|icone|tempoTexto\(LIMITE_SEGUNDOS\))|\?/.test(d),
      `valor dinâmico em HTML sem esc(): \${${d}}`
    );
  assert.ok(h.includes('uploadToSignedUrl(prep.data.caminho, prep.data.token'));
  assert.ok(h.includes('window.onbeforeunload = null'));
});

test('página do vídeo: tem mensagem para link inválido, vencido, cancelado e já enviado, e avisa de imagem, voz e 6 meses', () => {
  const h = ler('video.html');
  for (const t of ['Link inválido', 'O prazo deste pedido terminou', 'Este pedido foi cancelado', 'Vídeo já enviado'])
    assert.ok(h.includes(t), t);
  assert.ok(/sua imagem e sua voz/.test(h) && /limites\.retencaoMeses/.test(h) && /não pode ser trocado/.test(h));
});

// ======================= o painel do RH =======================
function ctx(papel = 'owner') {
  const c = carregarArquivos([
    'js/02-core-helpers.js',
    'js/40-page-rs.js',
    'js/45-rs-etapas.js',
    'js/46-rs-video.js',
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
  c.registrarAuditoria = async (evento, detalhes) => c.__auditoria.push([evento, detalhes]);
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
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function cenario(c, { videos = [], email = 'ana@x.com', etapasAtivas } = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Analista' }];
    state.rs = { requisicoes: [{ id: 'v1', cargoId: 'cg', codigo: 'REQ-1'${etapasAtivas ? `, etapasAtivas: ${J(etapasAtivas)}` : ''}, etapasConfig: { video: { instrucoes: 'Fale da sua experiência (vaga)', links: [] } } }],
      candidatos: [{ id: 'cd1', vagaId: 'v1', nome: 'Ana <b>Souza</b>', email: ${J(email)}, etapa: 'triagem', historico: [] }],
      configEtapas: { video: { instrucoes: 'Orientação GERAL da empresa', links: [] } } };
    _rsVideos = ${J(videos)}; _rsVideosErro = ''; _rsVideosCarregando = false;`
  );
}
const painel = (c) => rodar(c, 'videoPainelRS(state.rs.candidatos[0], state.rs.requisicoes[0])');
const ISO = (d) => new Date(d).toISOString();
const video = (extra) => ({
  id: 'vid1',
  candidato_ref: 'cd1',
  candidato_email: 'ana@x.com',
  status: 'solicitado',
  prazo_ate: ISO('2026-10-17T12:00:00Z'),
  criado_em: ISO('2026-10-10T12:00:00Z'),
  enviado_em: null,
  mime: null,
  tamanho_bytes: null,
  duracao_s: null,
  acima_do_limite: false,
  ...extra,
});

test('textos do painel: situações, tamanho, duração e data', () => {
  const c = ctx();
  assert.equal(rodar(c, "videoStatusRotuloRS('enviado').texto"), 'Vídeo enviado');
  assert.equal(rodar(c, "videoStatusRotuloRS('solicitado').texto"), 'Aguardando o candidato');
  assert.equal(rodar(c, "videoStatusRotuloRS('expirado').texto"), 'Prazo vencido');
  assert.equal(rodar(c, "videoStatusRotuloRS('cancelado').texto"), 'Pedido cancelado');
  assert.equal(rodar(c, 'videoTamanhoTextoRS(18.5 * 1048576)'), '18,5 MB');
  assert.equal(rodar(c, 'videoTamanhoTextoRS(null)'), '');
  assert.equal(rodar(c, 'videoDuracaoTextoRS(95)'), '1:35');
  assert.equal(rodar(c, 'videoDuracaoTextoRS(null)'), '');
});

test('o painel só aparece para Administrador/RH e só em vaga que USA a etapa de vídeo', () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c);
    assert.equal(painel(c), '', String(papel));
    assert.equal(c.__calls.length, 0, 'quem não pode ver nem consulta o servidor');
  }
  const c = ctx('rh');
  cenario(c, { etapasAtivas: ['triagem'] });
  assert.equal(painel(c), '', 'a vaga desligou a etapa de vídeo');
  assert.equal(c.__calls.length, 0);
  const c2 = ctx('rh');
  cenario(c2);
  assert.ok(painel(c2).includes('Vídeo de apresentação'));
  assert.equal(rodar(ctx('rh'), 'vagaUsaVideoRS({})'), true, 'vaga antiga usa todas as etapas');
});

test('painel: primeira vez carrega a lista UMA vez; se o servidor falhar mostra o motivo e não fica tentando', async () => {
  const c = ctx();
  cenario(c);
  rodar(c, '_rsVideos = null;');
  c.__respostas.video_listar = { data: { videos: [] }, error: null };
  assert.ok(painel(c).includes('Carregando'));
  painel(c);
  painel(c);
  await esperar();
  assert.equal(
    c.__calls.filter((x) => x.body.action === 'video_listar').length,
    1,
    'várias linhas do funil não repetem a consulta'
  );
  assert.equal(rodar(c, 'Array.isArray(_rsVideos)'), true);
  assert.ok(c.__renders >= 1);
  const c2 = ctx();
  cenario(c2);
  rodar(c2, '_rsVideos = null;');
  c2.__respostas.video_listar = { data: null, error: { message: 'Function not found' } };
  painel(c2);
  await esperar();
  assert.ok(painel(c2).includes('Não foi possível carregar os vídeos agora'));
  const antes = c2.__calls.length;
  painel(c2);
  await esperar();
  assert.equal(c2.__calls.length, antes, 'não tenta de novo a cada tela');
});

test('painel por situação: sem pedido, aguardando, enviado, vencido e cancelado mostram os botões certos', () => {
  const c = ctx();
  cenario(c);
  assert.ok(painel(c).includes('Pedir vídeo (envia o link por e-mail)'));
  const semEmail = ctx();
  cenario(semEmail, { email: '' });
  assert.ok(
    painel(semEmail).includes('gera um link para copiar') && !painel(semEmail).includes('envia o link por e-mail')
  );
  cenario(c, { videos: [video()] });
  let h = painel(c);
  assert.ok(
    h.includes('Aguardando o candidato') &&
      h.includes('Reenviar link') &&
      h.includes('Cancelar pedido') &&
      h.includes('link válido até') &&
      !h.includes('Assistir')
  );
  cenario(c, {
    videos: [
      video({ status: 'enviado', enviado_em: ISO('2026-10-12T12:00:00Z'), duracao_s: 95, tamanho_bytes: 18.5 * MB }),
    ],
  });
  h = painel(c);
  assert.ok(
    h.includes('Vídeo enviado') &&
      h.includes('1:35') &&
      h.includes('18,5 MB') &&
      h.includes('Assistir') &&
      h.includes('Excluir vídeo') &&
      !h.includes('Reenviar link')
  );
  cenario(c, { videos: [video({ status: 'expirado' })] });
  h = painel(c);
  assert.ok(h.includes('Prazo vencido') && h.includes('Reenviar link') && !h.includes('Cancelar pedido'));
  cenario(c, { videos: [video({ status: 'cancelado' })] });
  h = painel(c);
  assert.ok(h.includes('Pedido cancelado') && h.includes('Pedir vídeo'));
});

test('painel: vídeo informado como mais longo que 2 minutos aparece com aviso; o mais recente do candidato é o mostrado', () => {
  const c = ctx();
  cenario(c, { videos: [video({ status: 'enviado', duracao_s: 200, acima_do_limite: true, tamanho_bytes: 5 * MB })] });
  assert.ok(painel(c).includes('acima de 2 min'));
  cenario(c, { videos: [video({ id: 'novo', status: 'solicitado' }), video({ id: 'antigo', status: 'cancelado' })] });
  assert.ok(painel(c).includes('Aguardando o candidato') && !painel(c).includes('Pedido cancelado'));
});

test('o link do candidato aparece uma vez (escapado) só enquanto o pedido está aberto; o vídeo toca em link temporário escapado', () => {
  const c = ctx();
  cenario(c, { videos: [video()] });
  rodar(c, `_rsVideoLinks.vid1 = 'https://s.com/video.html?t=abc&x=<b>';`);
  const h = painel(c);
  assert.ok(h.includes('Link do candidato') && h.includes('&amp;x=&lt;b&gt;') && !h.includes('<b>'.repeat(1) + '"'));
  cenario(c, { videos: [video({ status: 'enviado' })] });
  rodar(
    c,
    `_rsVideoLinks.vid1 = 'https://s.com/video.html?t=abc'; _rsVideoPlayers.vid1 = { url: 'https://s.com/v.mp4?token="><script>x</script>', mime: 'video/mp4' };`
  );
  const p = painel(c);
  assert.ok(!p.includes('Link do candidato'), 'depois de enviado o link não aparece mais');
  assert.ok(p.includes('<video controls') && p.includes('10 minutos') && !p.includes('<script>'));
});

// ---------- ações ----------
test('pedir vídeo: manda o candidato, as orientações DA VAGA (não as gerais), o e-mail e o site; guarda o link e audita só IDs', async () => {
  const c = ctx();
  cenario(c);
  c.__respostas.video_solicitar = {
    data: {
      ok: true,
      pedido: { id: 'vid9' },
      link: 'https://site.com.br/Sistema-Norte/video.html?t=T',
      emailEnviado: true,
    },
    error: null,
  };
  c.__respostas.video_listar = { data: { videos: [] }, error: null };
  await rodar(c, "pedirVideoRS('cd1')");
  const req = c.__calls.find((x) => x.body.action === 'video_solicitar').body;
  assert.equal(req.candidato_ref, 'cd1');
  assert.equal(req.candidato_nome, 'Ana <b>Souza</b>');
  assert.equal(req.candidato_email, 'ana@x.com');
  assert.equal(req.instrucoes, 'Fale da sua experiência (vaga)', 'a orientação da vaga vale no lugar da geral');
  assert.equal(req.enviar_email, true);
  assert.equal(req.url_base, 'https://site.com.br/Sistema-Norte/');
  assert.equal(rodar(c, '_rsVideoLinks.vid9'), 'https://site.com.br/Sistema-Norte/video.html?t=T');
  assert.deepEqual(plano(c.__auditoria), [['rs.video_solicitado', { candidatoId: 'cd1', pedidoId: 'vid9' }]]);
  assert.ok(c.__toasts.some((t) => t.includes('enviado por e-mail')));
  assert.ok(
    c.__calls.some((x) => x.body.action === 'video_listar'),
    'recarrega a lista'
  );
});

test('pedir vídeo a candidato SEM e-mail: não manda e-mail e avisa para copiar o link', async () => {
  const c = ctx();
  cenario(c, { email: '' });
  c.__respostas.video_solicitar = {
    data: { ok: true, pedido: { id: 'vid9' }, link: 'https://s/video.html?t=T', emailEnviado: false },
    error: null,
  };
  c.__respostas.video_listar = { data: { videos: [] }, error: null };
  await rodar(c, "pedirVideoRS('cd1')");
  assert.equal(c.__calls.find((x) => x.body.action === 'video_solicitar').body.enviar_email, false);
  assert.ok(c.__toasts.some((t) => t.includes('Copie o link')));
});

test('pedir vídeo: se o servidor recusar, mostra o motivo (lendo a resposta do erro) e NÃO audita', async () => {
  const c = ctx();
  cenario(c);
  c.__respostas.video_solicitar = {
    data: null,
    error: {
      message: 'non-2xx',
      context: { json: async () => ({ error: 'Já existe um pedido de vídeo aberto para este candidato.' }) },
    },
  };
  await rodar(c, "pedirVideoRS('cd1')");
  assert.ok(c.__toasts.some((t) => t.includes('Já existe um pedido de vídeo aberto')));
  assert.equal(c.__auditoria.length, 0);
});

test('reenviar: gera link novo, guarda para copiar e audita; cancelar e excluir pedem confirmação antes de qualquer chamada', async () => {
  const c = ctx();
  cenario(c, { videos: [video()] });
  c.__respostas.video_reenviar = {
    data: { ok: true, link: 'https://s/video.html?t=NOVO', emailEnviado: true },
    error: null,
  };
  c.__respostas.video_listar = { data: { videos: [video()] }, error: null };
  await rodar(c, "reenviarVideoRS('vid1')");
  assert.equal(c.__calls.find((x) => x.body.action === 'video_reenviar').body.enviar_email, true);
  assert.equal(rodar(c, '_rsVideoLinks.vid1'), 'https://s/video.html?t=NOVO');
  assert.deepEqual(plano(c.__auditoria.at(-1)), ['rs.video_link_reenviado', { pedidoId: 'vid1' }]);
  const n = c.__calls.length;
  c.confirm = () => false;
  await rodar(c, "cancelarVideoRS('vid1')");
  await rodar(c, "excluirVideoRS('vid1')");
  assert.equal(c.__calls.length, n, 'recusou a confirmação: nenhuma chamada ao servidor');
  c.confirm = () => true;
  c.__respostas.video_cancelar = { data: { ok: true }, error: null };
  c.__respostas.video_excluir = { data: { ok: true }, error: null };
  await rodar(c, "cancelarVideoRS('vid1')");
  await rodar(c, "excluirVideoRS('vid1')");
  assert.deepEqual(plano(c.__auditoria.slice(-2).map((x) => x[0])), ['rs.video_cancelado', 'rs.video_excluido']);
});

test('assistir: guarda o link temporário para o player, audita só o ID do pedido; falha mostra o motivo', async () => {
  const c = ctx();
  cenario(c, { videos: [video({ status: 'enviado' })] });
  c.__respostas.video_assistir = { data: { ok: true, url: 'https://s/v.mp4?exp=600', mime: 'video/mp4' }, error: null };
  await rodar(c, "assistirVideoRS('vid1')");
  assert.deepEqual(plano(rodar(c, '_rsVideoPlayers.vid1')), { url: 'https://s/v.mp4?exp=600', mime: 'video/mp4' });
  assert.deepEqual(plano(c.__auditoria), [['rs.video_assistido', { pedidoId: 'vid1' }]]);
  rodar(c, "fecharVideoRS('vid1')");
  assert.equal(rodar(c, "'vid1' in _rsVideoPlayers"), false);
  c.__respostas.video_assistir = {
    data: null,
    error: { message: 'x', context: { json: async () => ({ error: 'Este candidato ainda não enviou o vídeo.' }) } },
  };
  await rodar(c, "assistirVideoRS('vid1')");
  assert.ok(c.__toasts.some((t) => t.includes('ainda não enviou')));
});

test('a Auditoria do vídeo nunca leva nome, e-mail ou link — só IDs', async () => {
  const c = ctx();
  cenario(c, { videos: [video({ status: 'enviado' })] });
  c.__respostas.video_solicitar = {
    data: { ok: true, pedido: { id: 'vid9' }, link: 'https://s/video.html?t=SEGREDO', emailEnviado: true },
    error: null,
  };
  c.__respostas.video_reenviar = {
    data: { ok: true, link: 'https://s/video.html?t=SEGREDO2', emailEnviado: true },
    error: null,
  };
  c.__respostas.video_assistir = { data: { ok: true, url: 'https://s/v.mp4', mime: 'video/mp4' }, error: null };
  c.__respostas.video_excluir = { data: { ok: true }, error: null };
  c.__respostas.video_listar = { data: { videos: [video({ status: 'enviado' })] }, error: null };
  await rodar(c, "pedirVideoRS('cd1')");
  await rodar(c, "reenviarVideoRS('vid1')");
  await rodar(c, "assistirVideoRS('vid1')");
  await rodar(c, "excluirVideoRS('vid1')");
  const texto = JSON.stringify(c.__auditoria);
  assert.ok(c.__auditoria.length >= 4);
  for (const proibido of ['Ana', 'Souza', 'ana@x.com', 'SEGREDO', 'http'])
    assert.ok(!texto.includes(proibido), `a auditoria vazou "${proibido}"`);
});

// ---------- mover o candidato para a etapa de vídeo ----------
test('mover para "Vídeo de apresentação" cria o pedido com o link e NÃO manda o aviso genérico da etapa', async () => {
  const c = ctx('owner');
  cenario(c);
  c.__respostas.video_solicitar = {
    data: { ok: true, pedido: { id: 'vid9' }, link: 'https://s/video.html?t=T', emailEnviado: true },
    error: null,
  };
  c.__respostas.video_listar = { data: { videos: [] }, error: null };
  rodar(c, "moverEtapaCandidatoRS('cd1', 'video')");
  await esperar(40);
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'video');
  assert.equal(c.__calls.filter((x) => x.body.action === 'video_solicitar').length, 1);
  assert.equal(
    c.__calls.filter((x) => x.nome === 'enviar-email').length,
    0,
    'o e-mail do pedido já leva as orientações e o link: não manda outro'
  );
});

test('mover para o vídeo quando o pedido FALHA: o candidato ainda recebe o aviso genérico da etapa', async () => {
  const c = ctx('owner');
  cenario(c);
  c.__respostas.video_solicitar = { data: null, error: { message: 'Function not found' } };
  rodar(c, "moverEtapaCandidatoRS('cd1', 'video')");
  await esperar(40);
  assert.equal(c.__calls.filter((x) => x.nome === 'enviar-email').length, 1);
  assert.ok(c.__toasts.some((t) => t.includes('Não foi possível pedir o vídeo')));
});

test('quem não é Administrador/RH movendo para a etapa de vídeo NÃO cria pedido (fica o aviso genérico)', async () => {
  const c = ctx('lider');
  cenario(c);
  rodar(c, "moverEtapaCandidatoRS('cd1', 'video')");
  await esperar(40);
  assert.equal(c.__calls.filter((x) => x.body.action === 'video_solicitar').length, 0);
  assert.equal(c.__calls.filter((x) => x.nome === 'enviar-email').length, 1);
});

// ======================= integração =======================
test('integração: o funil mostra o painel do vídeo, o app carrega o arquivo e as ações existem na função', () => {
  const rs = ler('js/40-page-rs.js');
  assert.ok(
    /videoPainelRS\(\s*c,\s*vaga\s*\)/.test(ler('js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js'))
  );
  assert.ok(/novaEtapa === 'video' && rsVideoHabilitado\(\)/.test(rs));
  assert.ok(
    ler('app.html').includes('js/46-rs-video.js', 'js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js')
  );
  const fn = ler('supabase/functions/video-rs/index.ts');
  const usadas = [
    ...ler('js/46-rs-video.js', 'js/48-rs-quadro.js', 'js/49-rs-entrega.js', 'js/50-rs-importacao.js').matchAll(
      /chamarVideoRS\('(video_\w+)'/g
    ),
  ].map((m) => m[1]);
  assert.ok(usadas.length >= 6);
  for (const a of new Set(usadas)) assert.ok(fn.includes(`action === '${a}'`), `a função não trata a ação ${a}`);
  const eslint = JSON.parse(ler('.eslintrc.json')).globals;
  for (const n of ['pedirVideoRS', 'videoPainelRS', 'rsVideoHabilitado', 'assistirVideoRS']) assert.ok(n in eslint, n);
});
