// =========================================================================
// Vídeo de apresentação do candidato (função video-rs): regras (2 minutos, 40 MB, formatos, tipo REAL do arquivo),
// o fluxo do candidato (pedir -> preparar o envio -> confirmar) e do RH (assistir, excluir), com banco e
// armazenamento simulados. Garantias testadas:
//   - só entra vídeo de verdade (os primeiros bytes conferem); arquivo falso, grande demais ou vazio é APAGADO;
//   - uma única entrega; - o código só existe como hash; - o RH só vê vídeos da própria empresa;
//   - o caminho interno do arquivo nunca vai ao navegador; - apagar o pedido apaga o arquivo.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeModule = require('node:module');
const { webcrypto } = require('node:crypto');
const { criarBanco } = require('./helpers/banco-falso.js');
const { criarArmazenamento } = require('./helpers/armazenamento-falso.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const opcoes =
  typeof nodeModule.stripTypeScriptTypes === 'function' ? {} : { skip: 'Node sem stripTypeScriptTypes (Node 22.13+)' };
const plano = (x) => JSON.parse(JSON.stringify(x));

function video() {
  const origem = ler('supabase/functions/video-rs/index.ts');
  const ini = origem.indexOf('// ---- Vídeos: regras puras');
  const fim = origem.indexOf('// ---- fim: operações');
  assert.ok(ini >= 0 && fim > ini);
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
    TextEncoder,
    btoa,
    crypto: webcrypto,
    Error,
    console: { error() {}, log() {} },
  });
  vm.runInContext(
    nodeModule.stripTypeScriptTypes(origem.slice(ini, fim)) +
      '\nthis.__k = { VIDEO_SEGUNDOS_MAX, VIDEO_BYTES_MAX, VIDEO_BYTES_MIN, VIDEO_RETENCAO_MESES, BUCKET, MIMES, TOKEN_RE };',
    ctx
  );
  return ctx;
}

// ---------- arquivos de exemplo (só o começo importa: é o que a função confere) ----------
const mp4 = (marca = 'isom') =>
  Uint8Array.from([
    0,
    0,
    0,
    24,
    0x66,
    0x74,
    0x79,
    0x70,
    ...[...marca].map((c) => c.charCodeAt(0)),
    0,
    0,
    2,
    0,
    ...new Array(40).fill(0),
  ]);
const mov = () => mp4('qt  ');
const webm = () => Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, ...new Array(60).fill(0)]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(60).fill(0)]);
const pdf = () => Uint8Array.from([...'%PDF-1.4'].map((c) => c.charCodeAt(0)).concat(new Array(60).fill(0)));
const AGORA = Date.parse('2026-10-10T12:00:00Z');
const ISO = (ms) => new Date(ms).toISOString();
const MB = 1024 * 1024;

// ======================= regras puras =======================
test('limites do vídeo: 2 minutos, 40 MB, retenção de 6 meses, só MP4, WebM e MOV', opcoes, () => {
  const c = video();
  assert.equal(c.__k.VIDEO_SEGUNDOS_MAX, 120);
  assert.equal(c.__k.VIDEO_BYTES_MAX, 40 * MB);
  assert.equal(c.__k.VIDEO_RETENCAO_MESES, 6);
  assert.deepEqual(plano(c.__k.MIMES), { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' });
  assert.equal(c.__k.BUCKET, 'videos-candidatos');
});

test('mimeBase tira o parâmetro de codec e ignora maiúsculas', opcoes, () => {
  const c = video();
  assert.equal(c.mimeBase('video/webm;codecs=vp9,opus'), 'video/webm');
  assert.equal(c.mimeBase(' Video/MP4 '), 'video/mp4');
  assert.equal(c.mimeBase(null), '');
});

test(
  'validarEnvio: aceita os 3 formatos dentro do tamanho; recusa outros formatos, vazio e grande demais (fronteiras exatas)',
  opcoes,
  () => {
    const c = video();
    const v = (mime, tamanho) => plano(c.validarEnvio({ mime, tamanho }));
    assert.deepEqual(v('video/mp4', 5 * MB), { ok: true, mime: 'video/mp4', ext: 'mp4' });
    assert.equal(v('video/webm;codecs=vp8,opus', 5 * MB).ext, 'webm');
    assert.equal(v('video/quicktime', 5 * MB).ext, 'mov');
    for (const mime of [
      'image/png',
      'application/pdf',
      'video/x-msvideo',
      'video/avi',
      'text/html',
      '',
      undefined,
      null,
    ])
      assert.equal(v(mime, 5 * MB).ok, false, String(mime));
    assert.equal(v('video/mp4', 10 * 1024).ok, true, '10 KB: o mínimo');
    assert.equal(v('video/mp4', 10 * 1024 - 1).ok, false);
    assert.equal(v('video/mp4', 40 * MB).ok, true, '40 MB exatos: o máximo');
    assert.equal(v('video/mp4', 40 * MB + 1).ok, false);
    assert.match(v('video/mp4', 40 * MB + 1).erro, /40 MB/);
    for (const t of [-5, 0, 1.5, 'abc', null, undefined, NaN]) assert.equal(v('video/mp4', t).ok, false, String(t));
    assert.equal(plano(c.validarEnvio(null)).ok, false);
  }
);

test(
  'tipo REAL do arquivo pelos primeiros bytes: MP4/MOV (ftyp) e WebM (EBML); imagem, PDF, texto e vazio não passam',
  opcoes,
  () => {
    const c = video();
    const f = (b) => c.familiaPeloConteudo(b);
    assert.equal(f(mp4()), 'mp4');
    assert.equal(f(mov()), 'mp4');
    assert.equal(f(webm()), 'webm');
    for (const ruim of [
      png(),
      pdf(),
      Uint8Array.from([60, 104, 116, 109, 108]),
      new Uint8Array(0),
      new Uint8Array(3),
      new Uint8Array(64),
    ])
      assert.equal(f(ruim), null);
  }
);

test(
  'o conteúdo precisa combinar com o formato declarado (WebM declarado como MP4, e vice-versa, é recusado)',
  opcoes,
  () => {
    const c = video();
    const ok = (b, m) => c.conteudoCombinaComMime(b, m);
    assert.equal(ok(mp4(), 'video/mp4'), true);
    assert.equal(ok(mov(), 'video/quicktime'), true);
    assert.equal(ok(mp4(), 'video/quicktime'), true, 'MP4 e MOV são da mesma família');
    assert.equal(ok(webm(), 'video/webm'), true);
    assert.equal(ok(webm(), 'video/mp4'), false);
    assert.equal(ok(mp4(), 'video/webm'), false);
    assert.equal(ok(png(), 'video/mp4'), false);
    assert.equal(ok(pdf(), 'video/webm'), false);
  }
);

test('duração informada: só um número informativo entre 0 e 3600 (inválido vira "desconhecida")', opcoes, () => {
  const c = video();
  const d = (v) => c.duracaoSanitizada(v);
  assert.equal(d(95), 95);
  assert.equal(d('88.6'), 89);
  assert.equal(d(0), 0);
  for (const ruim of [-1, 3601, NaN, 'abc', undefined, Infinity]) assert.equal(d(ruim), null, String(ruim));
});

test('situação (prazo), caminho do arquivo, código do link e link do e-mail', opcoes, async () => {
  const c = video();
  assert.equal(c.situacaoVideo({ status: 'solicitado', prazo_ate: ISO(AGORA - 1000) }, AGORA), 'expirado');
  assert.equal(c.situacaoVideo({ status: 'solicitado', prazo_ate: ISO(AGORA + 1000) }, AGORA), 'solicitado');
  assert.equal(
    c.situacaoVideo({ status: 'enviado', prazo_ate: ISO(AGORA - 99999) }, AGORA),
    'enviado',
    'depois de enviado o prazo não importa'
  );
  assert.equal(c.caminhoDoVideo('emp1', 'vid1', 'webm'), 'emp1/vid1/video.webm');
  const t = c.gerarToken();
  assert.equal(t.length, 43);
  assert.match(t, c.__k.TOKEN_RE);
  assert.equal(await c.hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const site = 'https://rhalley21.github.io/Sistema-Norte/';
  assert.equal(
    c.urlBaseSegura('https://rhalley21.github.io/Sistema-Norte/app.html?x=1', 'https://rhalley21.github.io', site),
    site
  );
  assert.equal(c.urlBaseSegura('https://golpe.com/video/', 'https://rhalley21.github.io', site), site);
  assert.equal(c.urlBaseSegura('javascript:alert(1)', null, site), site);
  assert.equal(c.urlBaseSegura('http://rhalley21.github.io/Sistema-Norte/', 'http://rhalley21.github.io', site), site);
});

test(
  'e-mail do pedido: nome, empresa e orientações escapados; diz 2 minutos, 40 MB, a validade e os 6 meses de guarda',
  opcoes,
  () => {
    const c = video();
    const html = c.corpoEmailVideo(
      'Ana <img src=x>',
      'Loja <b>X</b>',
      'Fale de você <script>x</script>\nSegunda linha',
      'https://s/video.html?t=abc',
      '2026-10-17T12:00:00Z'
    );
    assert.ok(!html.includes('<img') && !html.includes('<script>') && !html.includes('<b>X</b>'));
    assert.ok(html.includes('Segunda linha') && html.includes('<br>'));
    assert.ok(
      html.includes('2 minutos') &&
        html.includes('40 MB') &&
        html.includes('17/10/2026') &&
        html.includes('6 meses') &&
        html.includes('href="https://s/video.html?t=abc"')
    );
  }
);

// ======================= montagem do cenário =======================
const empresaA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const empresaB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function cenario() {
  const banco = criarBanco({
    rs_videos: [],
    empresas: [
      { id: empresaA, nome_fantasia: 'Loja <Teste>' },
      { id: empresaB, nome_fantasia: 'Outra' },
    ],
    __agora: ISO(AGORA),
  });
  const arm = criarArmazenamento();
  const admin = { from: (n) => banco.from(n), storage: arm };
  return { banco, arm, admin };
}
const pedido = (extra = {}) => ({
  empresaId: empresaA,
  perfilId: 'p1',
  candidato: { ref: 'cand-1', nome: 'Ana Souza', email: 'ana@x.com' },
  instrucoes: 'Apresente-se em até 2 minutos.',
  agora: AGORA,
  ...extra,
});
const lerInicioDe = (arm) => async (url) => {
  const m = /download\/videos-candidatos\/(.+?)\?/.exec(url);
  const arq = m && arm.arquivos.get(`videos-candidatos/${m[1]}`);
  if (!arq) throw new Error('não achei o arquivo');
  return arq.bytes.slice(0, 64);
};
async function comPedido(extra) {
  const c = video();
  const { banco, arm, admin } = cenario();
  const r = await c.criarPedido(admin, pedido(extra));
  const linha = banco.tabelas.rs_videos[0];
  return { c, banco, arm, admin, token: r.token, linha, r };
}
const enviarArquivo = (cen, bytes, ext = 'mp4', mimetype = 'video/mp4', tamanho) =>
  cen.arm.simularEnvio(
    'videos-candidatos',
    `${cen.linha.empresa_id}/${cen.linha.id}/video.${ext}`,
    bytes,
    mimetype,
    tamanho ?? 5 * MB
  );

// ======================= pedido do RH =======================
test(
  'pedir vídeo: guarda só o HASH do código, devolve o código uma única vez e o resumo não traz código nem caminho',
  opcoes,
  async () => {
    const { c, linha, r } = await comPedido();
    assert.equal(r.ok, true);
    assert.match(r.token, c.__k.TOKEN_RE);
    assert.equal(linha.token_hash, await c.hashToken(r.token));
    assert.ok(!JSON.stringify(linha).includes(r.token), 'o código em texto NÃO pode estar no banco');
    assert.equal(linha.status, 'solicitado');
    assert.equal(linha.prazo_ate, ISO(AGORA + 7 * 86400000));
    assert.equal(linha.instrucoes, 'Apresente-se em até 2 minutos.');
    const resumo = JSON.stringify(r.pedido);
    for (const k of ['token_hash', 'video_path', 'instrucoes', 'empresa_id'])
      assert.ok(!resumo.includes(k), `o resumo vazou ${k}`);
  }
);

test(
  'pedir vídeo: validade padrão 7 dias, personalizada e limitada a 30; entrada estranha cai no padrão',
  opcoes,
  async () => {
    for (const [entrada, dias] of [
      [3, 3],
      [30, 30],
      [90, 30],
      [0, 7],
      [-1, 7],
      ['abc', 7],
      [undefined, 7],
    ]) {
      const { linha } = await comPedido({ validadeDias: entrada });
      assert.equal(linha.prazo_ate, ISO(AGORA + dias * 86400000), `validade ${entrada}`);
    }
  }
);

test(
  'pedir vídeo: não duplica pedido aberto nem pede de novo a quem já enviou; depois de cancelar ou expirar, pode',
  opcoes,
  async () => {
    const cen = await comPedido();
    const dup = await cen.c.criarPedido(cen.admin, pedido());
    assert.equal(dup.ok, false);
    assert.match(dup.erro, /Já existe um pedido/);
    assert.equal(
      (await cen.c.criarPedido(cen.admin, pedido({ candidato: { ref: 'cand-2', nome: 'Bia', email: null } }))).ok,
      true,
      'outro candidato pode'
    );
    cen.linha.status = 'cancelado';
    assert.equal((await cen.c.criarPedido(cen.admin, pedido())).ok, true, 'depois de cancelar, pode');
    const exp = await comPedido();
    exp.linha.prazo_ate = ISO(AGORA - 1000);
    assert.equal((await exp.c.criarPedido(exp.admin, pedido())).ok, true, 'pedido vencido não bloqueia');
    const feito = await comPedido();
    feito.linha.status = 'enviado';
    const r = await feito.c.criarPedido(feito.admin, pedido());
    assert.equal(r.ok, false);
    assert.match(r.erro, /já enviou/);
  }
);

test('pedir vídeo: limite diário por empresa', opcoes, async () => {
  const c = video();
  const { banco, admin } = cenario();
  for (let i = 0; i < 300; i++)
    banco.tabelas.rs_videos.push({
      id: `x${i}`,
      empresa_id: empresaA,
      criado_em: ISO(AGORA - 3600000),
      status: 'expirado',
    });
  assert.match((await c.criarPedido(admin, pedido())).erro, /Limite diário/);
  const outra = cenario();
  for (let i = 0; i < 300; i++)
    outra.banco.tabelas.rs_videos.push({
      id: `y${i}`,
      empresa_id: empresaB,
      criado_em: ISO(AGORA - 3600000),
      status: 'expirado',
    });
  assert.equal((await c.criarPedido(outra.admin, pedido())).ok, true, 'outra empresa não conta');
});

// ======================= o candidato abre o link =======================
const VAZAMENTOS = ['token_hash', 'video_path', 'empresa_id', 'candidato_email', 'criado_por'];
const semVazamento = (corpo, rotulo) =>
  VAZAMENTOS.forEach((k) =>
    assert.ok(!JSON.stringify(corpo).includes(k), `${rotulo}: a resposta ao candidato vazou "${k}"`)
  );

test(
  'candidato: link inválido dá 404; link válido mostra a empresa, as orientações e os limites — sem dados internos',
  opcoes,
  async () => {
    const { c, admin, token } = await comPedido();
    assert.equal((await c.candidatoAbrir(admin, 'Z'.repeat(43), AGORA)).http, 404);
    const r = await c.candidatoAbrir(admin, token, AGORA);
    assert.equal(r.http, 200);
    assert.equal(r.corpo.estado, 'solicitado');
    assert.equal(r.corpo.empresa, 'Loja <Teste>');
    assert.equal(r.corpo.instrucoes, 'Apresente-se em até 2 minutos.');
    assert.deepEqual(plano(r.corpo.limites), { segundos: 120, bytes: 40 * MB, retencaoMeses: 6 });
    semVazamento(r.corpo, 'abrir');
  }
);

test(
  'candidato: pedido enviado, vencido ou cancelado mostra só o estado (sem orientações nem limites)',
  opcoes,
  async () => {
    for (const [mut, estado] of [
      [(l) => (l.status = 'enviado'), 'enviado'],
      [(l) => (l.prazo_ate = ISO(AGORA - 1000)), 'expirado'],
      [(l) => (l.status = 'cancelado'), 'cancelado'],
    ]) {
      const { c, admin, token, linha } = await comPedido();
      mut(linha);
      const r = await c.candidatoAbrir(admin, token, AGORA);
      assert.equal(r.corpo.estado, estado);
      assert.equal(r.corpo.instrucoes, undefined);
      assert.equal(r.corpo.limites, undefined);
      semVazamento(r.corpo, estado);
    }
  }
);

// ======================= preparar o envio =======================
test('preparar: formato ou tamanho inválido é recusado SEM falar com o armazenamento', opcoes, async () => {
  const { c, admin, arm, token } = await comPedido();
  for (const entrada of [
    { mime: 'image/png', tamanho: 5 * MB },
    { mime: 'video/mp4', tamanho: 41 * MB },
    { mime: 'video/mp4', tamanho: 100 },
    {},
    null,
  ]) {
    const r = await c.candidatoPreparar(admin, token, entrada, AGORA);
    assert.equal(r.http, 400, JSON.stringify(entrada));
  }
  assert.equal(arm.rastro.filter((x) => x.op === 'createSignedUploadUrl').length, 0);
});

test(
  'preparar: autoriza o envio de UM caminho (empresa/pedido/video.ext), com substituição permitida, e devolve só o necessário',
  opcoes,
  async () => {
    const { c, admin, arm, token, linha } = await comPedido();
    const r = await c.candidatoPreparar(admin, token, { mime: 'video/webm;codecs=vp9,opus', tamanho: 12 * MB }, AGORA);
    assert.equal(r.http, 200);
    assert.equal(r.corpo.caminho, `${empresaA}/${linha.id}/video.webm`);
    assert.match(r.corpo.token, /^tok-/);
    assert.equal(r.corpo.mime, 'video/webm');
    const chamada = arm.rastro.find((x) => x.op === 'createSignedUploadUrl');
    assert.equal(chamada.bucket, 'videos-candidatos');
    assert.equal(chamada.caminho, `${empresaA}/${linha.id}/video.webm`);
    assert.equal(chamada.opcoes.upsert, true, 'repetir o envio (conexão que caiu) precisa poder substituir');
    semVazamento(r.corpo, 'preparar');
  }
);

test('preparar: pedido enviado, vencido ou cancelado dá 409; link inválido dá 404', opcoes, async () => {
  for (const mut of [
    (l) => (l.status = 'enviado'),
    (l) => (l.prazo_ate = ISO(AGORA - 1000)),
    (l) => (l.status = 'cancelado'),
  ]) {
    const { c, admin, token, linha, arm } = await comPedido();
    mut(linha);
    assert.equal((await c.candidatoPreparar(admin, token, { mime: 'video/mp4', tamanho: 5 * MB }, AGORA)).http, 409);
    assert.equal(arm.rastro.filter((x) => x.op === 'createSignedUploadUrl').length, 0);
  }
  const { c, admin } = await comPedido();
  assert.equal(
    (await c.candidatoPreparar(admin, 'Z'.repeat(43), { mime: 'video/mp4', tamanho: 5 * MB }, AGORA)).http,
    404
  );
});

// ======================= confirmar o envio (a conferência de verdade) =======================
test('confirmar: vídeo MP4 de verdade vira "enviado", com tamanho, formato e duração informada', opcoes, async () => {
  const cen = await comPedido();
  enviarArquivo(cen, mp4(), 'mp4', 'video/mp4', 18 * MB);
  const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 95 }, AGORA, lerInicioDe(cen.arm));
  assert.deepEqual(plano(r), { http: 200, corpo: { ok: true, estado: 'enviado' } });
  assert.equal(cen.linha.status, 'enviado');
  assert.equal(cen.linha.video_path, `${empresaA}/${cen.linha.id}/video.mp4`);
  assert.equal(cen.linha.mime, 'video/mp4');
  assert.equal(cen.linha.tamanho_bytes, 18 * MB);
  assert.equal(cen.linha.duracao_s, 95);
  assert.equal(cen.linha.enviado_em, ISO(AGORA));
  semVazamento(r.corpo, 'confirmar');
  assert.equal(cen.arm.arquivos.size, 1, 'o arquivo bom é mantido');
});

test('confirmar: WebM (gravado pela página) e MOV (iPhone) também passam', opcoes, async () => {
  for (const [bytes, ext, mime] of [
    [webm(), 'webm', 'video/webm'],
    [mov(), 'mov', 'video/quicktime'],
  ]) {
    const cen = await comPedido();
    enviarArquivo(cen, bytes, ext, mime);
    assert.equal(
      (await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm))).corpo.estado,
      'enviado',
      ext
    );
    assert.equal(cen.linha.mime, mime);
  }
});

test(
  'confirmar: nada foi enviado ao armazenamento -> erro, e o pedido continua aberto pra tentar de novo',
  opcoes,
  async () => {
    const cen = await comPedido();
    const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm));
    assert.equal(r.http, 400);
    assert.match(r.corpo.error, /não chegou/);
    assert.equal(cen.linha.status, 'solicitado');
  }
);

test(
  'confirmar: arquivo que NÃO é vídeo (imagem, PDF, texto) é APAGADO e o pedido continua aberto',
  opcoes,
  async () => {
    for (const [bytes, rotulo] of [
      [png(), 'imagem'],
      [pdf(), 'PDF'],
      [Uint8Array.from([60, 115, 99, 114, 105, 112, 116, 62, ...new Array(60).fill(0)]), 'texto/HTML'],
    ]) {
      const cen = await comPedido();
      enviarArquivo(cen, bytes, 'mp4', 'video/mp4'); // o navegador DECLAROU que era vídeo
      const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm));
      assert.equal(r.http, 400, rotulo);
      assert.match(r.corpo.error, /não é um vídeo válido/);
      assert.equal(cen.arm.arquivos.size, 0, `${rotulo}: o arquivo falso precisa ser apagado`);
      assert.equal(cen.linha.status, 'solicitado');
      assert.equal(cen.linha.video_path, undefined);
    }
  }
);

test('confirmar: WebM com extensão de MP4 (conteúdo diferente do declarado) é recusado e apagado', opcoes, async () => {
  const cen = await comPedido();
  enviarArquivo(cen, webm(), 'mp4', 'video/mp4');
  assert.equal((await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm))).http, 400);
  assert.equal(cen.arm.arquivos.size, 0);
});

test(
  'confirmar: arquivo grande demais ou vazio é apagado (mesmo que o armazenamento tenha deixado passar)',
  opcoes,
  async () => {
    for (const [tamanho, trecho] of [
      [41 * MB, /grande demais/],
      [100, /vazio ou inválido/],
      [0, /vazio ou inválido/],
    ]) {
      const cen = await comPedido();
      enviarArquivo(cen, mp4(), 'mp4', 'video/mp4', tamanho);
      const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm));
      assert.equal(r.http, 400, String(tamanho));
      assert.match(r.corpo.error, trecho);
      assert.equal(cen.arm.arquivos.size, 0);
      assert.equal(cen.linha.status, 'solicitado');
    }
  }
);

test(
  'confirmar: tentativas com formatos diferentes deixam 2 arquivos -> apaga os dois e pede pra enviar de novo',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviarArquivo(cen, mp4(), 'mp4', 'video/mp4');
    enviarArquivo(cen, webm(), 'webm', 'video/webm');
    const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm));
    assert.equal(r.http, 400);
    assert.match(r.corpo.error, /mais de um envio/);
    assert.equal(cen.arm.arquivos.size, 0);
  }
);

test('confirmar: se não der pra ler o começo do arquivo, NÃO aceita (na dúvida, apaga)', opcoes, async () => {
  const cen = await comPedido();
  enviarArquivo(cen, mp4(), 'mp4', 'video/mp4');
  const r = await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, async () => {
    throw new Error('rede caiu');
  });
  assert.equal(r.http, 400);
  assert.equal(cen.arm.arquivos.size, 0);
  assert.equal(cen.linha.status, 'solicitado');
});

test(
  'confirmar: uma única entrega — confirmar de novo é idempotente; pedido vencido/cancelado dá 409',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviarArquivo(cen, mp4());
    await cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 60 }, AGORA, lerInicioDe(cen.arm));
    const de_novo = await cen.c.candidatoConfirmar(
      cen.admin,
      cen.token,
      { duracao_s: 5 },
      AGORA + 1000,
      lerInicioDe(cen.arm)
    );
    assert.deepEqual(plano(de_novo), { http: 200, corpo: { ok: true, estado: 'enviado' } });
    assert.equal(cen.linha.duracao_s, 60, 'a segunda confirmação não muda nada');
    for (const mut of [(l) => (l.prazo_ate = ISO(AGORA - 1000)), (l) => (l.status = 'cancelado')]) {
      const c2 = await comPedido();
      mut(c2.linha);
      assert.equal((await c2.c.candidatoConfirmar(c2.admin, c2.token, {}, AGORA, lerInicioDe(c2.arm))).http, 409);
    }
  }
);

test(
  'confirmar: duração informada acima de 2 minutos é guardada e o RH vê o aviso "acima do limite" (o servidor não assiste o vídeo)',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviarArquivo(cen, mp4());
    await cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 200 }, AGORA, lerInicioDe(cen.arm));
    assert.equal(cen.linha.duracao_s, 200);
    const [v] = plano(await cen.c.listarVideos(cen.admin, empresaA, [], AGORA));
    assert.equal(v.acima_do_limite, true);
    const ok = await comPedido();
    enviarArquivo(ok, mp4());
    await ok.c.candidatoConfirmar(ok.admin, ok.token, { duracao_s: 118 }, AGORA, lerInicioDe(ok.arm));
    assert.equal(plano(await ok.c.listarVideos(ok.admin, empresaA, [], AGORA))[0].acima_do_limite, false);
  }
);

// Faz as 2 primeiras leituras do código esperarem uma pela outra: a corrida de verdade (as duas leem o estado antes de qualquer gravação).
function comBarreira(banco, quantas) {
  let chegaram = 0;
  let liberar;
  const portao = new Promise((r) => (liberar = r));
  const original = banco.from;
  banco.from = (nome) => {
    const q = original(nome);
    if (nome !== 'rs_videos') return q;
    const maybe = q.maybeSingle.bind(q);
    q.maybeSingle = async () => {
      const r = await maybe();
      if (chegaram < quantas) {
        chegaram++;
        if (chegaram === quantas) liberar();
        await portao;
      }
      return r;
    };
    return q;
  };
}
test('CORRIDA: duas confirmações ao mesmo tempo marcam "enviado" uma vez só', opcoes, async () => {
  const cen = await comPedido();
  enviarArquivo(cen, mp4());
  comBarreira(cen.banco, 2);
  await Promise.all([
    cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 30 }, AGORA, lerInicioDe(cen.arm)),
    cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 99 }, AGORA, lerInicioDe(cen.arm)),
  ]);
  const marcacoes = cen.banco.rastro.filter(
    (x) => x.tabela === 'rs_videos' && x.op === 'update' && x.valores.status === 'enviado'
  );
  assert.equal(marcacoes.filter((x) => x.linhas === 1).length, 1);
  assert.equal(
    marcacoes.filter((x) => x.linhas === 0).length,
    1,
    'a segunda gravação foi barrada pela condição de status'
  );
  assert.equal(cen.linha.duracao_s, 30, 'vale a primeira confirmação');
});

// ======================= RH: listar, assistir, excluir =======================
test(
  'RH: listar mostra os pedidos da própria empresa (com situação), sem código nem caminho do arquivo, e filtra por candidato',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviarArquivo(cen, mp4(), 'mp4', 'video/mp4', 12 * MB);
    await cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 70 }, AGORA, lerInicioDe(cen.arm));
    const lista = plano(await cen.c.listarVideos(cen.admin, empresaA, [], AGORA + 1000));
    assert.equal(lista.length, 1);
    assert.equal(lista[0].status, 'enviado');
    assert.equal(lista[0].tamanho_bytes, 12 * MB);
    assert.equal(lista[0].duracao_s, 70);
    for (const k of ['token_hash', 'video_path']) assert.ok(!JSON.stringify(lista).includes(k), k);
    assert.equal((await cen.c.listarVideos(cen.admin, empresaA, ['cand-1'], AGORA)).length, 1);
    assert.equal((await cen.c.listarVideos(cen.admin, empresaA, ['outro'], AGORA)).length, 0);
    assert.equal((await cen.c.listarVideos(cen.admin, empresaB, [], AGORA)).length, 0, 'outra empresa não vê');
  }
);

test('RH: pedido vencido aparece como "expirado" na lista', opcoes, async () => {
  const cen = await comPedido();
  cen.linha.prazo_ate = ISO(AGORA - 1000);
  assert.equal(plano(await cen.c.listarVideos(cen.admin, empresaA, [], AGORA))[0].status, 'expirado');
});

test(
  'RH: assistir devolve um link de 10 minutos, só depois de enviado, só da própria empresa, e sem o caminho interno',
  opcoes,
  async () => {
    const cen = await comPedido();
    assert.equal((await cen.c.assistirVideo(cen.admin, empresaA, cen.linha.id)).http, 409, 'ainda não enviou');
    enviarArquivo(cen, mp4());
    await cen.c.candidatoConfirmar(cen.admin, cen.token, { duracao_s: 50 }, AGORA, lerInicioDe(cen.arm));
    const r = await cen.c.assistirVideo(cen.admin, empresaA, cen.linha.id);
    assert.equal(r.http, 200);
    assert.ok(r.corpo.url.includes('exp=600'));
    assert.equal(cen.arm.rastro.filter((x) => x.op === 'createSignedUrl').at(-1).segundos, 600);
    assert.equal(r.corpo.mime, 'video/mp4');
    const { url: _link, ...semOLink } = r.corpo; // o link temporário contém o caminho (é assim que funciona); nenhum OUTRO campo pode
    const texto = JSON.stringify(semOLink);
    assert.ok(
      !texto.includes('video_path') && !texto.includes(cen.linha.video_path) && !texto.includes('caminho'),
      'o caminho interno do arquivo não pode ir ao navegador fora do link temporário'
    );
    assert.equal((await cen.c.assistirVideo(cen.admin, empresaB, cen.linha.id)).http, 404, 'outra empresa');
    assert.equal((await cen.c.assistirVideo(cen.admin, empresaA, 'id-que-nao-existe')).http, 404);
  }
);

test(
  'RH: excluir apaga o ARQUIVO (inclusive sobras de tentativas) e o registro; outra empresa não consegue',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviarArquivo(cen, mp4());
    await cen.c.candidatoConfirmar(cen.admin, cen.token, {}, AGORA, lerInicioDe(cen.arm));
    cen.arm.simularEnvio('videos-candidatos', `${empresaA}/${cen.linha.id}/video.webm`, webm(), 'video/webm'); // sobra de uma tentativa
    assert.equal(await cen.c.excluirVideo(cen.admin, empresaB, cen.linha.id), false, 'outra empresa');
    assert.equal(cen.arm.arquivos.size, 2);
    assert.equal(await cen.c.excluirVideo(cen.admin, empresaA, cen.linha.id), true);
    assert.equal(cen.arm.arquivos.size, 0, 'nenhum arquivo pode sobrar');
    assert.equal(cen.banco.tabelas.rs_videos.length, 0);
    assert.equal(await cen.c.excluirVideo(cen.admin, empresaA, cen.linha.id), false);
  }
);

// ======================= segurança estática =======================
test('video-rs: a porta do candidato vem ANTES do login, é limitada por IP e valida o formato do código antes de tocar no banco', () => {
  const o = ler('supabase/functions/video-rs/index.ts');
  const iCand = o.indexOf("action.startsWith('candidato_video_')");
  const iAuth = o.indexOf('principal.auth.getUser()');
  assert.ok(iCand > 0 && iAuth > iCand);
  const bloco = o.slice(iCand, iAuth);
  assert.ok(
    bloco.includes('TOKEN_RE.test(token)') && bloco.includes("'video_token_invalido'") && bloco.includes('429')
  );
  assert.ok(bloco.indexOf('TOKEN_RE.test(token)') < bloco.indexOf('candidatoAbrir(admin, token'));
});

test('video-rs: a porta do RH exige Administrador/RH e TODA consulta ao banco é filtrada pela empresa', () => {
  const o = ler('supabase/functions/video-rs/index.ts');
  const rh = o.slice(o.indexOf('PORTA DO RH (login'));
  assert.ok(rh.includes("!['owner', 'rh'].includes(perfil.papel)") && rh.includes('403'));
  assert.ok(rh.indexOf("['owner', 'rh'].includes") < rh.indexOf("action === 'video_solicitar'"));
  const consultas = [...rh.matchAll(/\.from\(T\)([\s\S]{0,300}?)(?:;|\n\s*\n)/g)];
  assert.ok(consultas.length >= 3, `achei poucas consultas (${consultas.length})`);
  consultas.forEach((m) =>
    assert.ok(/\.eq\('empresa_id', empresaId\)/.test(m[0]), `consulta sem filtro de empresa:\n${m[0].slice(0, 200)}`)
  );
  // as operações compartilhadas também filtram pela empresa
  const ops = o.slice(o.indexOf('async function listarVideos'), o.indexOf('// ---- fim: operações'));
  assert.ok((ops.match(/\.eq\('empresa_id', empresaId\)/g) || []).length >= 4);
});

test('video-rs: sem Math.random; o código só vai ao banco como hash; o arquivo é conferido pelo começo, lido por pedido de faixa de bytes', () => {
  const o = ler('supabase/functions/video-rs/index.ts');
  assert.ok(!o.replace(/\/\/.*$/gm, '').includes('Math.random'));
  assert.ok(o.includes('token_hash: await hashToken(token)') && !/insert\(\{[^}]*token:/.test(o));
  assert.ok(o.includes("Range: 'bytes=0-63'") && o.includes('conteudoCombinaComMime(inicio, mime)'));
  assert.ok(
    o.indexOf('conteudoCombinaComMime(inicio, mime)') < o.indexOf("status: 'enviado'"),
    'só marca como enviado DEPOIS de conferir o conteúdo'
  );
});

test(
  'os limites do SQL do armazenamento são os mesmos da função (40 MB e os 3 formatos), com RLS sem política e privado',
  opcoes,
  () => {
    const c = video();
    const sql = ler('sql/42-videos-rs.sql');
    assert.ok(sql.includes(String(c.__k.VIDEO_BYTES_MAX)), 'o limite de tamanho do bucket precisa ser o da função');
    for (const mime of Object.keys(plano(c.__k.MIMES))) assert.ok(sql.includes(`'${mime}'`), mime);
    assert.ok(/'videos-candidatos', 'videos-candidatos', false/.test(sql), 'bucket privado');
    assert.ok(/alter table rs_videos enable row level security;/.test(sql) && !/create policy/i.test(sql));
  }
);
