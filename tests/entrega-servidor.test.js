// =========================================================================
// Resultado/entrega do candidato (função entrega-rs): regras (3 arquivos, 5 MB, PDF/PNG/JPG/WEBP, texto), fluxo do
// candidato (preparar -> confirmar) e do RH (ver, excluir), com banco e armazenamento simulados. Garantias:
//   - só entra arquivo do tipo declarado (os primeiros bytes conferem); qualquer problema APAGA tudo;
//   - uma única entrega; código só como hash; RH só vê da própria empresa; caminho interno nunca vai ao navegador.
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
const MB = 1024 * 1024;

function entrega() {
  const origem = ler('supabase/functions/entrega-rs/index.ts');
  const ini = origem.indexOf('// ---- Entregas: regras puras');
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
    Map,
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
      '\nthis.__k = { ENTREGA_ARQUIVOS_MAX, ENTREGA_BYTES_MAX, ENTREGA_BYTES_MIN, ENTREGA_TEXTO_MAX, ENTREGA_RETENCAO_MESES, BUCKET, MIMES, ETAPAS, TOKEN_RE };',
    ctx
  );
  return ctx;
}

// ---------- arquivos de exemplo (o começo é o que a função confere) ----------
const pdf = () => Uint8Array.from([...'%PDF-1.4\n'].map((c) => c.charCodeAt(0)).concat(new Array(60).fill(0)));
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(60).fill(0)]);
const jpg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
const webp = () =>
  Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, ...new Array(60).fill(0)]);
const gif = () => Uint8Array.from([...'GIF89a'].map((c) => c.charCodeAt(0)).concat(new Array(60).fill(0)));
const zip = () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(0)]);
const html = () => Uint8Array.from([...'<script>alert(1)</script>'].map((c) => c.charCodeAt(0)));
const AGORA = Date.parse('2026-10-10T12:00:00Z');
const ISO = (ms) => new Date(ms).toISOString();

// ======================= regras puras =======================
test(
  'limites: até 3 arquivos de 5 MB, PDF/PNG/JPG/WEBP, texto de 3000 caracteres, 6 meses de guarda, 4 etapas',
  opcoes,
  () => {
    const c = entrega();
    assert.equal(c.__k.ENTREGA_ARQUIVOS_MAX, 3);
    assert.equal(c.__k.ENTREGA_BYTES_MAX, 5 * MB);
    assert.equal(c.__k.ENTREGA_TEXTO_MAX, 3000);
    assert.equal(c.__k.ENTREGA_RETENCAO_MESES, 6);
    assert.equal(c.__k.BUCKET, 'entregas-candidatos');
    assert.deepEqual(plano(c.__k.MIMES), {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    });
    assert.deepEqual(Object.keys(plano(c.__k.ETAPAS)), ['disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica']);
  }
);

test(
  'nome do arquivo: sem pasta, sem caracteres de controle ou de caminho, no máximo 80; vazio vira "arquivo"',
  opcoes,
  () => {
    const c = entrega();
    const n = (x) => c.nomeSanitizado(x);
    assert.equal(n('resultado.pdf'), 'resultado.pdf');
    assert.equal(n('C:\\Users\\ana\\resultado.pdf'), 'resultado.pdf');
    assert.equal(n('../../etc/passwd'), 'passwd');
    assert.equal(n('a<b>c|d?.png'), 'abcd.png');
    assert.equal(n('x'.repeat(200)).length, 80);
    for (const vazio of ['', '   ', null, undefined, '/']) assert.equal(n(vazio), 'arquivo');
  }
);

test(
  'arquivos declarados: até 3, formatos permitidos, tamanho entre 100 bytes e 5 MB (fronteiras exatas); sem arquivo é válido (só texto)',
  opcoes,
  () => {
    const c = entrega();
    const v = (lista) => plano(c.validarArquivosDeclarados(lista));
    const um = (mime, tamanho) => v([{ mime, tamanho, nome: 'a' }]);
    assert.deepEqual(v([]), { ok: true, itens: [] });
    assert.deepEqual(v(null), { ok: true, itens: [] });
    assert.deepEqual(um('application/pdf', 1000).itens, [
      { indice: 1, mime: 'application/pdf', ext: 'pdf', tamanho: 1000, nome: 'a' },
    ]);
    assert.equal(um('image/jpeg', 1000).itens[0].ext, 'jpg');
    assert.equal(um('IMAGE/PNG; charset=x', 1000).ok, true);
    for (const mime of ['image/gif', 'application/zip', 'text/html', 'application/x-msdownload', '', undefined])
      assert.equal(um(mime, 1000).ok, false, String(mime));
    assert.equal(um('application/pdf', 100).ok, true);
    assert.equal(um('application/pdf', 99).ok, false);
    assert.equal(um('application/pdf', 5 * MB).ok, true);
    assert.equal(um('application/pdf', 5 * MB + 1).ok, false);
    assert.match(um('application/pdf', 6 * MB).erro, /5 MB/);
    for (const t of [-1, 0, 1.5, 'x', null, NaN]) assert.equal(um('application/pdf', t).ok, false, String(t));
    const tres = [1, 2, 3].map(() => ({ mime: 'image/png', tamanho: 500, nome: 'p.png' }));
    assert.deepEqual(
      v(tres).itens.map((i) => i.indice),
      [1, 2, 3]
    );
    assert.equal(v([...tres, tres[0]]).ok, false, 'o quarto arquivo é recusado');
    assert.match(v([...tres, tres[0]]).erro, /no máximo 3/);
  }
);

test(
  'tipo REAL do arquivo pelos primeiros bytes: PDF, PNG, JPEG e WEBP; GIF, ZIP, HTML e vazio não passam; precisa bater com o declarado',
  opcoes,
  () => {
    const c = entrega();
    const real = (b) => c.mimePeloConteudo(b);
    assert.equal(real(pdf()), 'application/pdf');
    assert.equal(real(png()), 'image/png');
    assert.equal(real(jpg()), 'image/jpeg');
    assert.equal(real(webp()), 'image/webp');
    for (const ruim of [gif(), zip(), html(), new Uint8Array(0), new Uint8Array(4), new Uint8Array(64)])
      assert.equal(real(ruim), null);
    assert.equal(c.conteudoCombinaComMime(png(), 'image/png'), true);
    assert.equal(c.conteudoCombinaComMime(png(), 'image/jpeg'), false, 'PNG declarado como JPG');
    assert.equal(c.conteudoCombinaComMime(pdf(), 'image/png'), false);
    assert.equal(c.conteudoCombinaComMime(html(), 'application/pdf'), false, 'HTML disfarçado de PDF');
  }
);

test('texto da resposta: tira caracteres nulos e espaços das pontas e corta em 3000', opcoes, () => {
  const c = entrega();
  assert.equal(c.textoSanitizado('  Resultado: perfil D\u0000 '), 'Resultado: perfil D');
  assert.equal(c.textoSanitizado('x'.repeat(5000)).length, 3000);
  for (const vazio of [null, undefined, '', '   ']) assert.equal(c.textoSanitizado(vazio), '');
});

test(
  'situação por prazo, caminho de cada arquivo e e-mail do pedido (escapado, com 3 arquivos, 5 MB, 6 meses e a validade)',
  opcoes,
  () => {
    const c = entrega();
    assert.equal(c.situacaoEntrega({ status: 'solicitado', prazo_ate: ISO(AGORA - 1) }, AGORA), 'expirado');
    assert.equal(c.situacaoEntrega({ status: 'enviado', prazo_ate: ISO(AGORA - 99) }, AGORA), 'enviado');
    assert.equal(c.caminhoDoArquivo('emp', 'ent', 2, 'png'), 'emp/ent/arquivo-2.png');
    const h = c.corpoEmailEntrega(
      'Ana <img src=x>',
      'Loja <b>X</b>',
      'Teste <script>',
      'https://s/entrega.html?t=abc',
      '2026-10-17T12:00:00Z'
    );
    assert.ok(!h.includes('<img') && !h.includes('<script>') && !h.includes('<b>X</b>'));
    assert.ok(
      h.includes('3 arquivos') &&
        h.includes('5 MB') &&
        h.includes('6 meses') &&
        h.includes('17/10/2026') &&
        h.includes('href="https://s/entrega.html?t=abc"')
    );
  }
);

// ======================= montagem do cenário =======================
const empresaA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const empresaB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function cenario() {
  const banco = criarBanco({
    rs_entregas: [],
    empresas: [
      { id: empresaA, nome_fantasia: 'Loja <Teste>' },
      { id: empresaB, nome_fantasia: 'Outra' },
    ],
    __agora: ISO(AGORA),
  });
  const arm = criarArmazenamento();
  return { banco, arm, admin: { from: (n) => banco.from(n), storage: arm } };
}
const pedido = (extra = {}) => ({
  empresaId: empresaA,
  perfilId: 'p1',
  candidato: { ref: 'cand-1', nome: 'Ana Souza', email: 'ana@x.com' },
  etapa: 'disc_galt',
  instrucoes: 'Envie o print do resultado.',
  agora: AGORA,
  ...extra,
});
const lerInicioDe = (arm) => async (url) => {
  const m = /download\/entregas-candidatos\/(.+?)\?/.exec(url);
  const a = m && arm.arquivos.get(`entregas-candidatos/${m[1]}`);
  if (!a) throw new Error('sem arquivo');
  return a.bytes.slice(0, 64);
};
async function comPedido(extra) {
  const c = entrega();
  const { banco, arm, admin } = cenario();
  const r = await c.criarPedido(admin, pedido(extra));
  return { c, banco, arm, admin, token: r.token, linha: banco.tabelas.rs_entregas.at(-1), r };
}
const enviar = (cen, indice, ext, bytes, tamanho = 2000) =>
  cen.arm.simularEnvio(
    'entregas-candidatos',
    `${cen.linha.empresa_id}/${cen.linha.id}/arquivo-${indice}.${ext}`,
    bytes,
    'application/octet-stream',
    tamanho
  );
const decl = (indice, ext, mime, nome = `r${indice}.${ext}`) => ({ indice, mime, nome });
const D = (...itens) => itens.map((i) => ({ mime: i.mime, nome: i.nome }));

// ======================= pedido do RH =======================
test(
  'pedir resultado: só o HASH do código vai ao banco; o resumo não traz código, caminho nem texto; etapa inválida é recusada',
  opcoes,
  async () => {
    const { c, linha, r } = await comPedido();
    assert.equal(r.ok, true);
    assert.match(r.token, c.__k.TOKEN_RE);
    assert.equal(linha.token_hash, await c.hashToken(r.token));
    assert.ok(!JSON.stringify(linha).includes(r.token));
    assert.equal(linha.etapa, 'disc_galt');
    assert.equal(linha.prazo_ate, ISO(AGORA + 7 * 86400000));
    const resumo = JSON.stringify(r.pedido);
    for (const k of ['token_hash', 'caminho', 'instrucoes', 'empresa_id', 'texto_resposta"'])
      assert.ok(!resumo.includes(k), `o resumo vazou ${k}`);
    const { c: c2, admin } = await comPedido();
    assert.equal((await c2.criarPedido(admin, pedido({ etapa: 'entrevista_fit' }))).ok, false);
    assert.equal((await c2.criarPedido(admin, pedido({ etapa: 'redes_sociais' }))).ok, false);
  }
);

test('pedir resultado: validade padrão 7 dias, personalizada e limitada a 30', opcoes, async () => {
  for (const [entrada, dias] of [
    [3, 3],
    [30, 30],
    [90, 30],
    [0, 7],
    ['abc', 7],
    [undefined, 7],
  ]) {
    const { linha } = await comPedido({ validadeDias: entrada });
    assert.equal(linha.prazo_ate, ISO(AGORA + dias * 86400000), String(entrada));
  }
});

test(
  'voltar para a etapa gera link NOVO (o pedido aberto anterior é cancelado); quem já enviou não recebe outro; etapas diferentes não se misturam',
  opcoes,
  async () => {
    const cen = await comPedido();
    const primeiro = cen.linha;
    const r2 = await cen.c.criarPedido(cen.admin, pedido());
    assert.equal(r2.ok, true);
    assert.equal(primeiro.status, 'cancelado', 'o link antigo deixa de valer');
    assert.equal(cen.banco.tabelas.rs_entregas.filter((x) => x.status === 'solicitado').length, 1);
    assert.equal(
      (await cen.c.criarPedido(cen.admin, pedido({ etapa: 'prova_pratica' }))).ok,
      true,
      'outra etapa do mesmo candidato é independente'
    );
    cen.banco.tabelas.rs_entregas.find((x) => x.status === 'solicitado' && x.etapa === 'disc_galt').status = 'enviado';
    const r3 = await cen.c.criarPedido(cen.admin, pedido());
    assert.equal(r3.ok, false);
    assert.equal(r3.jaEnviado, true);
  }
);

test('pedir resultado: limite diário por empresa', opcoes, async () => {
  const c = entrega();
  const { banco, admin } = cenario();
  for (let i = 0; i < 300; i++)
    banco.tabelas.rs_entregas.push({
      id: `x${i}`,
      empresa_id: empresaA,
      candidato_ref: `c${i}`,
      etapa: 'disc_galt',
      criado_em: ISO(AGORA - 3600000),
      status: 'expirado',
    });
  assert.match((await c.criarPedido(admin, pedido())).erro, /Limite diário/);
  const outra = cenario();
  for (let i = 0; i < 300; i++)
    outra.banco.tabelas.rs_entregas.push({
      id: `y${i}`,
      empresa_id: empresaB,
      candidato_ref: `c${i}`,
      etapa: 'disc_galt',
      criado_em: ISO(AGORA - 3600000),
      status: 'expirado',
    });
  assert.equal((await c.criarPedido(outra.admin, pedido())).ok, true);
});

// ======================= o candidato =======================
const VAZ = ['token_hash', 'empresa_id', 'candidato_email', 'criado_por'];
const semVazamento = (corpo, rot) =>
  VAZ.forEach((k) => assert.ok(!JSON.stringify(corpo).includes(k), `${rot}: a resposta ao candidato vazou "${k}"`));

test(
  'candidato abre o link: link inválido 404; válido mostra empresa, etapa, orientações e limites; enviado/vencido/cancelado só o estado',
  opcoes,
  async () => {
    const { c, admin, token, linha } = await comPedido();
    assert.equal((await c.candidatoAbrir(admin, 'Z'.repeat(43), AGORA)).http, 404);
    const r = await c.candidatoAbrir(admin, token, AGORA);
    assert.equal(r.corpo.estado, 'solicitado');
    assert.equal(r.corpo.empresa, 'Loja <Teste>');
    assert.equal(r.corpo.etapa, 'Teste DISC e GALT');
    assert.equal(r.corpo.instrucoes, 'Envie o print do resultado.');
    assert.deepEqual(plano(r.corpo.limites), { arquivos: 3, bytes: 5 * MB, texto: 3000, retencaoMeses: 6 });
    semVazamento(r.corpo, 'abrir');
    for (const [mut, estado] of [
      [(l) => (l.status = 'enviado'), 'enviado'],
      [(l) => (l.prazo_ate = ISO(AGORA - 1)), 'expirado'],
      [(l) => (l.status = 'cancelado'), 'cancelado'],
    ]) {
      const x = await comPedido();
      mut(x.linha);
      const rr = await x.c.candidatoAbrir(x.admin, x.token, AGORA);
      assert.equal(rr.corpo.estado, estado);
      assert.equal(rr.corpo.instrucoes, undefined);
      assert.equal(rr.corpo.limites, undefined);
    }
    void linha;
  }
);

test(
  'preparar: arquivo inválido ou 4 arquivos é recusado SEM falar com o armazenamento; válido recebe um caminho de envio por arquivo (com substituição permitida)',
  opcoes,
  async () => {
    const { c, admin, arm, token, linha } = await comPedido();
    for (const arquivos of [
      [{ mime: 'image/gif', tamanho: 1000 }],
      [{ mime: 'application/pdf', tamanho: 6 * MB }],
      [{ mime: 'application/pdf', tamanho: 5 }],
      new Array(4).fill({ mime: 'image/png', tamanho: 500 }),
    ])
      assert.equal((await c.candidatoPreparar(admin, token, { arquivos }, AGORA)).http, 400);
    assert.equal(arm.rastro.filter((x) => x.op === 'createSignedUploadUrl').length, 0);
    const r = await c.candidatoPreparar(
      admin,
      token,
      {
        arquivos: [
          { mime: 'application/pdf', tamanho: 3000, nome: 'a.pdf' },
          { mime: 'image/png', tamanho: 4000, nome: 'b.png' },
        ],
      },
      AGORA
    );
    assert.equal(r.http, 200);
    assert.deepEqual(plano(r.corpo.envios.map((e) => [e.indice, e.caminho, e.mime])), [
      [1, `${empresaA}/${linha.id}/arquivo-1.pdf`, 'application/pdf'],
      [2, `${empresaA}/${linha.id}/arquivo-2.png`, 'image/png'],
    ]);
    const chamadas = arm.rastro.filter((x) => x.op === 'createSignedUploadUrl');
    assert.equal(chamadas.length, 2);
    chamadas.forEach((x) => assert.equal(x.opcoes.upsert, true));
    semVazamento(r.corpo, 'preparar');
    assert.deepEqual(
      plano((await c.candidatoPreparar(admin, token, { arquivos: [] }, AGORA)).corpo.envios),
      [],
      'só texto: nada a enviar ao armazenamento'
    );
  }
);

test('preparar: pedido enviado, vencido ou cancelado dá 409; link inválido dá 404', opcoes, async () => {
  for (const mut of [
    (l) => (l.status = 'enviado'),
    (l) => (l.prazo_ate = ISO(AGORA - 1)),
    (l) => (l.status = 'cancelado'),
  ]) {
    const x = await comPedido();
    mut(x.linha);
    assert.equal(
      (await x.c.candidatoPreparar(x.admin, x.token, { arquivos: [{ mime: 'application/pdf', tamanho: 1000 }] }, AGORA))
        .http,
      409
    );
  }
  const { c, admin } = await comPedido();
  assert.equal((await c.candidatoPreparar(admin, 'Z'.repeat(43), { arquivos: [] }, AGORA)).http, 404);
});

// ======================= confirmar =======================
test(
  'confirmar: PDF + PNG de verdade viram "enviado", com nomes, tamanhos e o texto; caminhos guardados só no servidor',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviar(cen, 1, 'pdf', pdf(), 3000);
    enviar(cen, 2, 'png', png(), 4000);
    const r = await cen.c.candidatoConfirmar(
      cen.admin,
      cen.token,
      {
        arquivos: [
          { mime: 'application/pdf', nome: 'C:\\Users\\ana\\resultado.pdf' },
          { mime: 'image/png', nome: 'print.png' },
        ].map((a, i) => ({ ...a, tamanho: 1000, indice: i + 1 })),
        texto: ' Perfil D alto ',
      },
      AGORA,
      lerInicioDe(cen.arm)
    );
    assert.deepEqual(plano(r), { http: 200, corpo: { ok: true, estado: 'enviado' } });
    assert.equal(cen.linha.status, 'enviado');
    assert.equal(cen.linha.texto_resposta, 'Perfil D alto');
    assert.deepEqual(plano(cen.linha.arquivos.map((a) => [a.nome, a.mime, a.tamanho])), [
      ['resultado.pdf', 'application/pdf', 3000],
      ['print.png', 'image/png', 4000],
    ]);
    assert.ok(cen.linha.arquivos.every((a) => a.caminho.startsWith(`${empresaA}/${cen.linha.id}/`)));
    assert.equal(cen.linha.enviado_em, ISO(AGORA));
    semVazamento(r.corpo, 'confirmar');
    assert.equal(cen.arm.arquivos.size, 2);
  }
);

test('confirmar: só texto, sem arquivo, funciona; sem arquivo e sem texto é recusado', opcoes, async () => {
  const cen = await comPedido();
  const r = await cen.c.candidatoConfirmar(
    cen.admin,
    cen.token,
    { arquivos: [], texto: 'Resultado: 80%' },
    AGORA,
    lerInicioDe(cen.arm)
  );
  assert.equal(r.corpo.estado, 'enviado');
  assert.equal(cen.linha.texto_resposta, 'Resultado: 80%');
  assert.deepEqual(plano(cen.linha.arquivos), []);
  const vazio = await comPedido();
  const rr = await vazio.c.candidatoConfirmar(
    vazio.admin,
    vazio.token,
    { arquivos: [], texto: '   ' },
    AGORA,
    lerInicioDe(vazio.arm)
  );
  assert.equal(rr.http, 400);
  assert.match(rr.corpo.error, /pelo menos um arquivo/);
  assert.equal(vazio.linha.status, 'solicitado');
});

test(
  'confirmar: arquivo que NÃO é do tipo declarado (HTML/GIF/ZIP/PNG disfarçado de PDF) APAGA TODOS os arquivos e o pedido continua aberto',
  opcoes,
  async () => {
    for (const [ruim, rot] of [
      [html(), 'HTML'],
      [gif(), 'GIF'],
      [zip(), 'ZIP'],
      [png(), 'PNG declarado como PDF'],
    ]) {
      const cen = await comPedido();
      enviar(cen, 1, 'png', png(), 3000); // este está bom
      enviar(cen, 2, 'pdf', ruim, 3000); // este é falso
      const r = await cen.c.candidatoConfirmar(
        cen.admin,
        cen.token,
        {
          arquivos: [
            { mime: 'image/png', nome: 'ok.png', tamanho: 1, indice: 1 },
            { mime: 'application/pdf', nome: 'falso.pdf', tamanho: 1, indice: 2 },
          ],
        },
        AGORA,
        lerInicioDe(cen.arm)
      );
      assert.equal(r.http, 400, rot);
      assert.match(r.corpo.error, /falso\.pdf.*não é um PDF válido/);
      assert.equal(cen.arm.arquivos.size, 0, `${rot}: nenhum arquivo pode sobrar`);
      assert.equal(cen.linha.status, 'solicitado');
    }
  }
);

test(
  'confirmar: arquivo que não chegou, vazio ou grande demais -> apaga tudo e avisa qual arquivo',
  opcoes,
  async () => {
    const faltou = await comPedido();
    enviar(faltou, 1, 'pdf', pdf());
    const r1 = await faltou.c.candidatoConfirmar(
      faltou.admin,
      faltou.token,
      {
        arquivos: [
          { mime: 'application/pdf', nome: 'a.pdf', tamanho: 1 },
          { mime: 'image/png', nome: 'b.png', tamanho: 1 },
        ],
      },
      AGORA,
      lerInicioDe(faltou.arm)
    );
    assert.match(r1.corpo.error, /"b\.png" não chegou/);
    assert.equal(faltou.arm.arquivos.size, 0);
    for (const tam of [10, 5 * MB + 1]) {
      const x = await comPedido();
      enviar(x, 1, 'pdf', pdf(), tam);
      const r = await x.c.candidatoConfirmar(
        x.admin,
        x.token,
        { arquivos: [{ mime: 'application/pdf', nome: 'a.pdf', tamanho: 1 }] },
        AGORA,
        lerInicioDe(x.arm)
      );
      assert.equal(r.http, 400, String(tam));
      assert.equal(x.arm.arquivos.size, 0);
    }
  }
);

test(
  'confirmar: arquivo que ninguém declarou (sobra de tentativa com outro formato) é APAGADO e não entra no resultado',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviar(cen, 1, 'pdf', pdf());
    enviar(cen, 1, 'png', png()); // sobra de uma tentativa anterior com outro formato
    const r = await cen.c.candidatoConfirmar(
      cen.admin,
      cen.token,
      { arquivos: [{ mime: 'application/pdf', nome: 'a.pdf', tamanho: 1 }] },
      AGORA,
      lerInicioDe(cen.arm)
    );
    assert.equal(r.corpo.estado, 'enviado');
    assert.deepEqual([...cen.arm.arquivos.keys()], [`entregas-candidatos/${empresaA}/${cen.linha.id}/arquivo-1.pdf`]);
    assert.equal(cen.linha.arquivos.length, 1);
  }
);

test('confirmar: se não der pra ler o começo do arquivo, NÃO aceita (na dúvida, apaga)', opcoes, async () => {
  const cen = await comPedido();
  enviar(cen, 1, 'pdf', pdf());
  const r = await cen.c.candidatoConfirmar(
    cen.admin,
    cen.token,
    { arquivos: [{ mime: 'application/pdf', nome: 'a.pdf', tamanho: 1 }] },
    AGORA,
    async () => {
      throw new Error('rede caiu');
    }
  );
  assert.equal(r.http, 400);
  assert.equal(cen.arm.arquivos.size, 0);
  assert.equal(cen.linha.status, 'solicitado');
});

test(
  'confirmar: uma única entrega — de novo é idempotente e não muda nada; vencido/cancelado dá 409',
  opcoes,
  async () => {
    const cen = await comPedido();
    enviar(cen, 1, 'pdf', pdf());
    await cen.c.candidatoConfirmar(
      cen.admin,
      cen.token,
      { arquivos: [{ mime: 'application/pdf', nome: 'a.pdf', tamanho: 1 }], texto: 'primeira' },
      AGORA,
      lerInicioDe(cen.arm)
    );
    const de_novo = await cen.c.candidatoConfirmar(
      cen.admin,
      cen.token,
      { arquivos: [], texto: 'segunda' },
      AGORA + 1000,
      lerInicioDe(cen.arm)
    );
    assert.deepEqual(plano(de_novo), { http: 200, corpo: { ok: true, estado: 'enviado' } });
    assert.equal(cen.linha.texto_resposta, 'primeira');
    for (const mut of [(l) => (l.prazo_ate = ISO(AGORA - 1)), (l) => (l.status = 'cancelado')]) {
      const x = await comPedido();
      mut(x.linha);
      assert.equal(
        (await x.c.candidatoConfirmar(x.admin, x.token, { arquivos: [], texto: 'x' }, AGORA, lerInicioDe(x.arm))).http,
        409
      );
    }
  }
);

function comBarreira(banco, quantas) {
  let chegaram = 0;
  let liberar;
  const portao = new Promise((r) => (liberar = r));
  const original = banco.from;
  banco.from = (nome) => {
    const q = original(nome);
    if (nome !== 'rs_entregas') return q;
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
test('CORRIDA: duas confirmações ao mesmo tempo marcam "enviado" uma vez só (vale a primeira)', opcoes, async () => {
  const cen = await comPedido();
  comBarreira(cen.banco, 2);
  await Promise.all([
    cen.c.candidatoConfirmar(cen.admin, cen.token, { arquivos: [], texto: 'A' }, AGORA, lerInicioDe(cen.arm)),
    cen.c.candidatoConfirmar(cen.admin, cen.token, { arquivos: [], texto: 'B' }, AGORA, lerInicioDe(cen.arm)),
  ]);
  const marcacoes = cen.banco.rastro.filter(
    (x) => x.tabela === 'rs_entregas' && x.op === 'update' && x.valores.status === 'enviado'
  );
  assert.equal(marcacoes.filter((x) => x.linhas === 1).length, 1);
  assert.equal(marcacoes.filter((x) => x.linhas === 0).length, 1);
  assert.equal(cen.linha.texto_resposta, 'A');
});

// ======================= RH =======================
async function comEnviado(texto = 'Resultado X') {
  const cen = await comPedido();
  enviar(cen, 1, 'pdf', pdf(), 3000);
  await cen.c.candidatoConfirmar(
    cen.admin,
    cen.token,
    { arquivos: [{ mime: 'application/pdf', nome: 'resultado.pdf', tamanho: 1 }], texto },
    AGORA,
    lerInicioDe(cen.arm)
  );
  return cen;
}

test(
  'RH: listar mostra só da própria empresa, com situação e quantidades, sem código, caminho nem o texto do candidato',
  opcoes,
  async () => {
    const cen = await comEnviado('Texto secreto do candidato');
    const lista = plano(await cen.c.listarEntregas(cen.admin, empresaA, [], AGORA + 1000));
    assert.equal(lista.length, 1);
    assert.deepEqual(
      [lista[0].status, lista[0].qtd_arquivos, lista[0].tem_texto, lista[0].etapa],
      ['enviado', 1, true, 'disc_galt']
    );
    const j = JSON.stringify(lista);
    for (const k of ['token_hash', 'caminho', 'Texto secreto']) assert.ok(!j.includes(k), k);
    assert.equal((await cen.c.listarEntregas(cen.admin, empresaA, ['cand-1'], AGORA)).length, 1);
    assert.equal((await cen.c.listarEntregas(cen.admin, empresaA, ['outro'], AGORA)).length, 0);
    assert.equal((await cen.c.listarEntregas(cen.admin, empresaB, [], AGORA)).length, 0, 'outra empresa não vê');
  }
);

test(
  'RH: ver o resultado só depois de enviado, só da própria empresa; arquivos por link de 10 minutos; o caminho interno nunca sai',
  opcoes,
  async () => {
    const pend = await comPedido();
    assert.equal((await pend.c.verEntrega(pend.admin, empresaA, pend.linha.id)).http, 409);
    const cen = await comEnviado('Meu resultado');
    const r = await cen.c.verEntrega(cen.admin, empresaA, cen.linha.id);
    assert.equal(r.http, 200);
    assert.equal(r.corpo.texto, 'Meu resultado');
    assert.equal(r.corpo.arquivos.length, 1);
    assert.ok(r.corpo.arquivos[0].url.includes('exp=600'));
    assert.deepEqual(
      [r.corpo.arquivos[0].nome, r.corpo.arquivos[0].mime, r.corpo.arquivos[0].tamanho],
      ['resultado.pdf', 'application/pdf', 3000]
    );
    assert.ok(!JSON.stringify(r.corpo.arquivos.map((a) => ({ ...a, url: undefined }))).includes('caminho'));
    assert.equal(cen.arm.rastro.filter((x) => x.op === 'createSignedUrl').at(-1).segundos, 600);
    assert.equal((await cen.c.verEntrega(cen.admin, empresaB, cen.linha.id)).http, 404);
  }
);

test('RH: excluir apaga os ARQUIVOS (inclusive sobras) e o registro; outra empresa não consegue', opcoes, async () => {
  const cen = await comEnviado();
  cen.arm.simularEnvio('entregas-candidatos', `${empresaA}/${cen.linha.id}/arquivo-3.png`, png(), 'image/png');
  assert.equal(await cen.c.excluirEntrega(cen.admin, empresaB, cen.linha.id), false);
  assert.equal(cen.arm.arquivos.size, 2);
  assert.equal(await cen.c.excluirEntrega(cen.admin, empresaA, cen.linha.id), true);
  assert.equal(cen.arm.arquivos.size, 0, 'nenhum arquivo pode sobrar');
  assert.equal(cen.banco.tabelas.rs_entregas.length, 0);
});

// ======================= segurança estática =======================
test('entrega-rs: a porta do candidato vem ANTES do login, é limitada por IP e valida o código antes de tocar no banco', () => {
  const o = ler('supabase/functions/entrega-rs/index.ts');
  const iCand = o.indexOf("action.startsWith('candidato_entrega_')");
  const iAuth = o.indexOf('principal.auth.getUser()');
  assert.ok(iCand > 0 && iAuth > iCand);
  const bloco = o.slice(iCand, iAuth);
  assert.ok(
    bloco.includes('TOKEN_RE.test(token)') && bloco.includes("'entrega_token_invalido'") && bloco.includes('429')
  );
  assert.ok(bloco.indexOf('TOKEN_RE.test(token)') < bloco.indexOf('candidatoAbrir(admin, token'));
});

test('entrega-rs: a porta do RH exige Administrador/RH e TODA consulta ao banco é filtrada pela empresa', () => {
  const o = ler('supabase/functions/entrega-rs/index.ts');
  const rh = o.slice(o.indexOf('PORTA DO RH (login'));
  assert.ok(rh.includes("!['owner', 'rh'].includes(perfil.papel)") && rh.includes('403'));
  const consultas = [...rh.matchAll(/\.from\(T\)([\s\S]{0,300}?)(?:;|\n\s*\n)/g)];
  assert.ok(consultas.length >= 3, `achei poucas consultas (${consultas.length})`);
  consultas.forEach((m) =>
    assert.ok(/\.eq\('empresa_id', empresaId\)/.test(m[0]), `consulta sem filtro de empresa:\n${m[0].slice(0, 200)}`)
  );
  const ops = o.slice(o.indexOf('async function criarPedido'), o.indexOf('// ---- fim: operações'));
  assert.ok((ops.match(/\.eq\('empresa_id', (empresaId|p\.empresaId)\)/g) || []).length >= 5);
});

test('entrega-rs: sem Math.random; só o hash do código no banco; confere o conteúdo ANTES de marcar como enviado', () => {
  const o = ler('supabase/functions/entrega-rs/index.ts');
  assert.ok(!o.replace(/\/\/.*$/gm, '').includes('Math.random'));
  assert.ok(o.includes('token_hash: await hashToken(token)') && !/insert\(\{[^}]*\btoken:/.test(o));
  assert.ok(o.includes("Range: 'bytes=0-63'"));
  assert.ok(o.indexOf('conteudoCombinaComMime(inicio, mimeReal)') < o.indexOf("status: 'enviado'"));
});

test(
  'os limites do SQL do armazenamento são os mesmos da função (5 MB e os 4 formatos), com RLS sem política e privado',
  opcoes,
  () => {
    const c = entrega();
    const sql = ler('sql/43-entregas-rs.sql');
    assert.ok(sql.includes(String(c.__k.ENTREGA_BYTES_MAX)));
    for (const mime of Object.keys(plano(c.__k.MIMES))) assert.ok(sql.includes(`'${mime}'`), mime);
    for (const etapa of Object.keys(plano(c.__k.ETAPAS))) assert.ok(sql.includes(`'${etapa}'`), etapa);
    assert.ok(/'entregas-candidatos', 'entregas-candidatos', false/.test(sql));
    assert.ok(/alter table rs_entregas enable row level security;/.test(sql) && !/create policy/i.test(sql));
  }
);
