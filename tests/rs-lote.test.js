// =========================================================================
// Mover e reprovar em lote (js/55-rs-lote.js). O lote usa o MESMO código da movimentação individual (aplicarMovimentoRS e
// aplicarReprovacaoRS); aqui se prova o planejamento (o que cada candidato vai receber), a execução (um por vez, com relatório
// de falhas de e-mail), as permissões e a tela.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const plano = (x) => JSON.parse(JSON.stringify(x));
const J = JSON.stringify;
const rodar = (c, codigo) => vm.runInContext(codigo, c);

function ctx(papel = 'rh') {
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
    'js/55-rs-lote.js',
  ]);
  Object.assign(c, {
    meuPapelReal: papel,
    meuPerfilId: 'p1',
    URL,
    __chamadas: [],
    __toasts: [],
    __auditoria: [],
    __renders: 0,
  });
  c.render = () => c.__renders++;
  c.showToast = (t) => c.__toasts.push(t);
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.setTimeout = setTimeout;
  c.__responder = () => ({ data: { ok: true }, error: null });
  c.sb = {
    functions: { invoke: async (nome, { body }) => (c.__chamadas.push([nome, body]), c.__responder(nome, body)) },
  };
  rodar(c, 'LOTE_RS_PAUSA_MS = 0');
  return c;
}
const VAGA = {
  id: 'v1',
  codigo: 'REQ-1',
  cargoId: 'cg',
  status: 'aprovada',
  publicada: true,
  etapasAtivas: ['triagem', 'entrevista_fit', 'entrevista_final'],
};
const cand = (id, etapa, extra) => ({
  id,
  vagaId: 'v1',
  nome: `Cand ${id}`,
  email: `${id}@x.com`,
  etapa,
  reprovado: false,
  historico: [],
  ...extra,
});
function cenario(c, candidatos, vaga = VAGA) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = []; state.rs = { requisicoes: [${J(vaga)}], candidatos: ${J(candidatos)}, configEtapas: {} }; _rsRequisicaoExpandida = 'v1'; _rsSelecaoAtiva = false; _rsSelecionados = []; _rsLote = null;`
  );
}
const emails = (c) => c.__chamadas.filter((x) => x[0] === 'enviar-email').map((x) => x[1]);
const estado = (c) => plano(rodar(c, 'state.rs.candidatos'));
async function lote(c, ids, acao, { destino, motivo } = {}) {
  rodar(c, `_rsSelecaoAtiva = true; _rsSelecionados = ${J(ids)};`);
  rodar(c, `abrirLoteRS(${J(acao)})`);
  if (destino) rodar(c, `mudarDestinoLoteRS(${J(destino)})`);
  if (motivo !== undefined) rodar(c, `mudarMotivoLoteRS(${J(motivo)})`);
  await rodar(c, 'executarLoteRS()');
}
const planejar = (c, candidatos, acao, destino, vaga = VAGA) =>
  plano(rodar(c, `planejarLoteRS(${J({ candidatos, vaga, acao, destino })})`));

// ======================= planejamento =======================
test('avançar: cada candidato vai para a PRÓXIMA etapa DA VAGA (as etapas desligadas são puladas)', () => {
  const c = ctx();
  const p = planejar(c, [cand('a', 'nova'), cand('b', 'triagem'), cand('c', 'entrevista_fit')], 'avancar');
  assert.deepEqual(
    p.itens.map((i) => [i.id, i.de, i.para]),
    [
      ['a', 'nova', 'triagem'],
      ['b', 'triagem', 'entrevista_fit'],
      ['c', 'entrevista_fit', 'entrevista_final'],
    ]
  );
  assert.deepEqual(
    p.grupos.map((g) => [g.etapa, g.total]),
    [
      ['triagem', 1],
      ['entrevista_fit', 1],
      ['entrevista_final', 1],
    ]
  );
  assert.equal(p.erro, null);
});

test('avançar: quem não pode é IGNORADO com o motivo (reprovado, contratado, na última etapa)', () => {
  const c = ctx();
  const p = planejar(
    c,
    [
      cand('r', 'triagem', { reprovado: true }),
      cand('h', 'aprovado', { convertidoEm: '2026-10-01' }),
      cand('u', 'aprovado'),
      cand('ok', 'nova'),
    ],
    'avancar'
  );
  assert.deepEqual(
    p.itens.map((i) => i.id),
    ['ok']
  );
  assert.deepEqual(
    p.ignorados.map((i) => [i.id, i.motivo]),
    [
      ['r', 'já está reprovado(a)'],
      ['h', 'já foi contratado(a)'],
      ['u', 'já está na última etapa'],
    ]
  );
});

test('mover: exige uma etapa da vaga; quem já está nela é ignorado', () => {
  const c = ctx();
  const lista = [cand('a', 'nova'), cand('b', 'triagem')];
  assert.equal(planejar(c, lista, 'mover', '').erro, 'Escolha a etapa de destino.');
  assert.equal(planejar(c, lista, 'mover', 'video').erro, 'Essa etapa não faz parte desta vaga.');
  const p = planejar(c, lista, 'mover', 'triagem');
  assert.deepEqual(
    p.itens.map((i) => i.id),
    ['a']
  );
  assert.deepEqual(
    p.ignorados.map((i) => [i.id, i.motivo]),
    [['b', 'já está nessa etapa']]
  );
});

test('reprovar: todos os ativos viram "Reprovados"; quem já está reprovado é ignorado; não há avisos de etapa', () => {
  const c = ctx();
  const p = planejar(
    c,
    [cand('a', 'nova'), cand('b', 'triagem'), cand('r', 'triagem', { reprovado: true })],
    'reprovar'
  );
  assert.deepEqual(
    p.itens.map((i) => i.id),
    ['a', 'b']
  );
  assert.deepEqual(p.grupos, [{ etapa: 'reprovado', nome: 'Reprovados', total: 2 }]);
  assert.deepEqual(
    p.ignorados.map((i) => i.id),
    ['r']
  );
  assert.deepEqual(p.avisos, []);
});

test('limite: 50 candidatos por vez passa; 51 não', () => {
  const c = ctx();
  const mil = (n) => Array.from({ length: n }, (_, i) => cand(`m${i}`, 'nova'));
  assert.equal(planejar(c, mil(50), 'avancar').erro, null);
  assert.equal(planejar(c, mil(51), 'avancar').erro, 'Selecione no máximo 50 candidatos por vez.');
});

test('nenhum elegível: erro claro, e não há o que confirmar', () => {
  const c = ctx();
  assert.equal(
    planejar(c, [cand('r', 'nova', { reprovado: true })], 'avancar').erro,
    'Nenhum dos selecionados pode ser movido desta forma.'
  );
  assert.equal(planejar(c, [], 'avancar').erro, 'Nenhum dos selecionados pode ser movido desta forma.');
});

test('e-mails: conta quem recebe e quem não tem e-mail cadastrado; etapas só do RH não mandam e-mail', () => {
  const c = ctx();
  const vaga = { ...VAGA, etapasAtivas: ['triagem', 'redes_sociais'] };
  const lista = [cand('a', 'nova'), cand('b', 'nova', { email: '' }), cand('d', 'nova')];
  const triagem = planejar(c, lista, 'mover', 'triagem', vaga);
  assert.deepEqual([triagem.comEmail, triagem.semEmail], [2, 1]);
  const redes = planejar(c, lista, 'mover', 'redes_sociais', vaga);
  assert.deepEqual([redes.comEmail, redes.semEmail], [0, 0], 'o candidato não recebe e-mail nessa etapa');
  const rep = planejar(c, lista, 'reprovar', '', vaga);
  assert.deepEqual([rep.comEmail, rep.semEmail], [2, 1], 'a reprovação também avisa por e-mail');
});

test('avisos: DISC/GALT sem orientações e prova prática sem definição, uma vez por etapa de destino', () => {
  const c = ctx();
  const vaga = { ...VAGA, etapasAtivas: ['disc_galt', 'prova_pratica'] };
  const p = planejar(c, [cand('a', 'nova')], 'mover', 'disc_galt', vaga);
  assert.equal(p.avisos.length, 1);
  assert.match(p.avisos[0], /DISC/i);
  assert.match(
    planejar(c, [cand('a', 'nova'), cand('b', 'nova')], 'mover', 'prova_pratica', vaga).avisos[0],
    /prova prática/
  );
  const comConfig = {
    ...vaga,
    etapasConfig: { disc_galt: { instrucoes: 'Faça o teste', links: [{ rotulo: 'DISC', url: 'https://x.com/disc' }] } },
  };
  assert.equal(
    rodar(c, `temOrientacoesEtapaRS(configEfetivaEtapaRS(${J(comConfig)}, 'disc_galt'), 'disc_galt')`),
    true,
    'o cenário de teste tem orientações de verdade'
  );
  assert.deepEqual(planejar(c, [cand('a', 'nova')], 'mover', 'disc_galt', comConfig).avisos, []);
});

// ======================= retorno dos e-mails (a base do relatório de falhas) =======================
test('enviarEmailEtapaRS devolve true (saiu), false (falhou) ou null (nada a mandar)', async () => {
  const c = ctx();
  cenario(c, []);
  const enviar = (candidato, etapa) => rodar(c, `enviarEmailEtapaRS(${J(candidato)}, ${J(etapa)})`);
  assert.equal(await enviar(cand('a', 'nova'), 'triagem'), true);
  assert.equal(await enviar(cand('a', 'nova', { email: '' }), 'triagem'), null, 'sem e-mail cadastrado');
  assert.equal(await enviar(cand('a', 'nova'), 'redes_sociais'), null, 'etapa sem e-mail');
  c.__responder = () => ({ data: null, error: { message: 'falhou' } });
  assert.equal(await enviar(cand('a', 'nova'), 'triagem'), false);
  c.__responder = () => ({ data: { error: 'RESEND_API_KEY não configurada' }, error: null });
  assert.equal(await enviar(cand('a', 'nova'), 'triagem'), false, 'erro vindo no corpo da resposta também conta');
  c.sb.functions.invoke = async () => {
    throw new Error('rede caiu');
  };
  assert.equal(await enviar(cand('a', 'nova'), 'triagem'), false);
});

// ======================= execução =======================
test('avançar em lote: muda a etapa, registra o histórico e manda UM e-mail por candidato, sem avisos soltos na tela', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'triagem'), cand('c', 'entrevista_fit'), cand('fora', 'nova')]);
  await lote(c, ['a', 'b', 'c'], 'avancar');
  const e = estado(c);
  assert.deepEqual(
    e.map((x) => x.etapa),
    ['triagem', 'entrevista_fit', 'entrevista_final', 'nova'],
    'quem não foi marcado não muda'
  );
  for (const x of e.slice(0, 3)) {
    const ultimo = x.historico.at(-1);
    assert.equal(ultimo.autorId, 'p1');
    assert.ok(ultimo.em && !Number.isNaN(Date.parse(ultimo.em)));
  }
  assert.deepEqual(e[0].historico.at(-1).de, 'nova');
  assert.deepEqual(
    emails(c).map((m) => m.destinatario),
    ['a@x.com', 'b@x.com', 'c@x.com']
  );
  assert.equal(c.__toasts.length, 1, 'um resumo no fim, não um aviso por candidato');
  assert.match(c.__toasts[0], /3 candidato\(s\) movido\(s\)/);
  assert.deepEqual([rodar(c, '_rsLote.fase'), plano(rodar(c, '_rsSelecionados'))], ['pronto', []]);
});

test('mover em lote para uma etapa escolhida', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'triagem')]);
  await lote(c, ['a', 'b'], 'mover', { destino: 'entrevista_final' });
  assert.deepEqual(
    estado(c).map((x) => x.etapa),
    ['entrevista_final', 'entrevista_final']
  );
  assert.equal(emails(c).length, 2);
});

test('reprovar em lote: o motivo (sem espaços sobrando) vai para o histórico de cada um e o e-mail de reprovação sai', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'triagem'), cand('b', 'nova'), cand('r', 'nova', { reprovado: true })]);
  await lote(c, ['a', 'b', 'r'], 'reprovar', { motivo: '  Sem o perfil da vaga  ' });
  const e = estado(c);
  assert.deepEqual(
    e.map((x) => x.reprovado),
    [true, true, true]
  );
  assert.deepEqual(
    e.slice(0, 2).map((x) => [x.historico.at(-1).para, x.historico.at(-1).observacao, x.historico.at(-1).de]),
    [
      ['reprovado', 'Sem o perfil da vaga', 'triagem'],
      ['reprovado', 'Sem o perfil da vaga', 'nova'],
    ]
  );
  assert.equal(e[2].historico.length, 0, 'quem já estava reprovado não é mexido');
  assert.equal(emails(c).length, 2);
  assert.match(c.__toasts[0], /2 candidato\(s\) reprovado\(s\)/);
});

test('o motivo guarda no máximo 300 caracteres', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova')]);
  await lote(c, ['a'], 'reprovar', { motivo: 'x'.repeat(500) });
  assert.equal(estado(c)[0].historico.at(-1).observacao.length, 300);
});

test('um e-mail que NÃO sai não desfaz nem bloqueia a movimentação, e o resumo diz QUEM ficou sem aviso', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova'), cand('d', 'nova')]);
  c.__responder = (nome, body) =>
    body.destinatario === 'b@x.com'
      ? { data: null, error: { message: 'caixa cheia' } }
      : { data: { ok: true }, error: null };
  await lote(c, ['a', 'b', 'd'], 'avancar');
  assert.deepEqual(
    estado(c).map((x) => x.etapa),
    ['triagem', 'triagem', 'triagem'],
    'os três foram movidos'
  );
  const r = plano(rodar(c, '_rsLote.resultado'));
  assert.deepEqual(
    r.falhasEmail.map((f) => [f.nome, f.tipo, f.etapa]),
    [['Cand b', 'etapa', 'triagem']]
  );
  assert.match(c.__toasts[0], /1 e-mail\(s\) não saíram/);
  assert.ok(rodar(c, 'painelLoteHtml(state.rs.requisicoes[0])').includes('Cand b'), 'o painel final mostra o nome');
});

test('"Tentar enviar de novo": reenvia só os que falharam; os que saem somem da lista', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')]);
  c.__responder = () => ({ data: null, error: { message: 'fora do ar' } });
  await lote(c, ['a', 'b'], 'avancar');
  assert.equal(plano(rodar(c, '_rsLote.resultado.falhasEmail')).length, 2);
  c.__chamadas.length = 0;
  c.__responder = (nome, body) =>
    body.destinatario === 'a@x.com'
      ? { data: { ok: true }, error: null }
      : { data: null, error: { message: 'ainda fora' } };
  await rodar(c, 'reenviarFalhasLoteRS()');
  assert.deepEqual(
    plano(rodar(c, '_rsLote.resultado.falhasEmail')).map((f) => f.nome),
    ['Cand b']
  );
  assert.equal(emails(c).length, 2, 'só tentou os dois que tinham falhado');
  assert.match(c.__toasts.at(-1), /1 e-mail\(s\) enviado\(s\)/);
});

test('candidato sem e-mail cadastrado é movido e NÃO conta como falha', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova', { email: '' }), cand('b', 'nova')]);
  await lote(c, ['a', 'b'], 'avancar');
  assert.deepEqual(
    estado(c).map((x) => x.etapa),
    ['triagem', 'triagem']
  );
  assert.equal(emails(c).length, 1);
  assert.deepEqual(plano(rodar(c, '_rsLote.resultado.falhasEmail')), []);
});

test('quem mudou de etapa enquanto o painel estava aberto é PULADO, não movido por engano', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova'), cand('d', 'nova')]);
  rodar(c, '_rsSelecaoAtiva = true; _rsSelecionados = ["a","b","d"]; abrirLoteRS("avancar");');
  rodar(c, 'state.rs.candidatos[1].etapa = "triagem"; state.rs.candidatos[2].reprovado = true;'); // outra pessoa mexeu
  await rodar(c, 'executarLoteRS()');
  assert.deepEqual(
    estado(c).map((x) => x.etapa),
    ['triagem', 'triagem', 'nova']
  );
  assert.deepEqual(
    plano(rodar(c, '_rsLote.resultado.pulados')).map((p) => [p.nome, p.motivo]),
    [
      ['Cand b', 'mudou enquanto isso'],
      ['Cand d', 'mudou enquanto isso'],
    ]
  );
  assert.equal(emails(c).length, 1);
});

test('um erro inesperado em um candidato não derruba o lote: os outros seguem e o erro é relatado', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('x', 'nova'), cand('d', 'nova')]);
  rodar(
    c,
    "const original = aplicarMovimentoRS; aplicarMovimentoRS = function (cand, etapa, opcoes) { if (cand.id === 'x') throw new Error('boom'); return original(cand, etapa, opcoes); };"
  );
  c.console = { ...console, warn() {} };
  await lote(c, ['a', 'x', 'd'], 'avancar');
  const r = plano(rodar(c, '_rsLote.resultado'));
  assert.equal(r.movidos, 2);
  assert.deepEqual(
    r.erros.map((x) => x.nome),
    ['Cand x']
  );
  assert.equal(estado(c)[1].etapa, 'nova');
});

test('duplo clique em "Confirmar" não manda os e-mails em dobro', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')]);
  rodar(c, '_rsSelecaoAtiva = true; _rsSelecionados = ["a","b"]; abrirLoteRS("avancar");');
  const um = rodar(c, 'executarLoteRS()');
  const dois = rodar(c, 'executarLoteRS()');
  await Promise.all([um, dois]);
  assert.equal(emails(c).length, 2);
  assert.equal(c.__auditoria.filter((a) => a[0] === 'rs.lote').length, 1);
});

test('um candidato por vez (nunca em paralelo): não estoura o limite de envio', async () => {
  const c = ctx();
  cenario(
    c,
    Array.from({ length: 5 }, (_, i) => cand(`s${i}`, 'nova'))
  );
  let ativos = 0;
  let maximo = 0;
  c.sb.functions.invoke = async (nome, { body }) => {
    ativos++;
    maximo = Math.max(maximo, ativos);
    await new Promise((r) => setTimeout(r, 4));
    ativos--;
    c.__chamadas.push([nome, body]);
    return { data: { ok: true }, error: null };
  };
  await lote(c, ['s0', 's1', 's2', 's3', 's4'], 'avancar');
  assert.equal(maximo, 1);
  assert.equal(emails(c).length, 5);
});

test('a pausa entre os candidatos existe (e não há pausa depois do último)', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova'), cand('d', 'nova')]);
  const pausas = [];
  rodar(c, 'LOTE_RS_PAUSA_MS = 7');
  c.setTimeout = (fn, ms) => (pausas.push(ms), setTimeout(fn, 0));
  await lote(c, ['a', 'b', 'd'], 'avancar');
  assert.deepEqual(pausas, [7, 7]);
});

test('a Auditoria guarda só as contagens, nunca nomes nem e-mails', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')]);
  c.__responder = (n, body) =>
    body.destinatario === 'b@x.com' ? { data: null, error: { message: 'x' } } : { data: { ok: true }, error: null };
  await lote(c, ['a', 'b'], 'avancar');
  assert.deepEqual(plano(c.__auditoria), [
    ['rs.lote', { acao: 'avancar', vagaId: 'v1', total: 2, movidos: 2, falhasEmail: 1, pulados: 0 }],
  ]);
  assert.ok(!J(c.__auditoria).includes('Cand') && !J(c.__auditoria).includes('@x.com'));
});

test('etapa de VÍDEO: cada candidato recebe o seu pedido (link pessoal) e a lista é recarregada UMA vez no fim', async () => {
  const c = ctx('owner');
  const vaga = { ...VAGA, etapasAtivas: ['triagem', 'video'] };
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')], vaga);
  let recargas = 0;
  rodar(c, "urlBaseVideoRS = () => 'https://x.test/';");
  c.carregarVideosRS = async () => {
    recargas++;
  };
  c.__responder = (nome, body) =>
    nome === 'video-rs'
      ? {
          data: {
            pedido: { id: `pv-${body.candidato_ref}` },
            link: `https://x.test/video.html?t=${body.candidato_ref}`,
            emailEnviado: true,
          },
          error: null,
        }
      : { data: { ok: true }, error: null };
  await lote(c, ['a', 'b'], 'mover', { destino: 'video' });
  const pedidos = c.__chamadas.filter((x) => x[0] === 'video-rs');
  assert.deepEqual(
    pedidos.map((x) => [x[1].action, x[1].candidato_ref]),
    [
      ['video_solicitar', 'a'],
      ['video_solicitar', 'b'],
    ]
  );
  assert.equal(emails(c).length, 0, 'o aviso genérico não sai junto do pedido de vídeo');
  assert.equal(recargas, 1);
  assert.equal(c.__toasts.length, 1);
  assert.deepEqual(
    estado(c).map((x) => x.etapa),
    ['video', 'video']
  );
});

test('etapa com RESULTADO (DISC/GALT, testes, prova prática): cada um recebe o seu pedido e o e-mail com o botão; recarga única', async () => {
  const c = ctx('owner');
  const vaga = {
    ...VAGA,
    etapasAtivas: ['triagem', 'teste_logico'],
    etapasConfig: {
      teste_logico: { instrucoes: 'Faça o teste', links: [{ rotulo: 'Teste', url: 'https://x.com/t' }] },
    },
  };
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')], vaga);
  let recargas = 0;
  const pedidos = [];
  c.pedirEntregaRS = async (id, etapa) => (
    pedidos.push([id, etapa]),
    { ok: true, link: `https://x.test/entrega.html?t=${id}`, prazoISO: '2026-12-01T00:00:00Z' }
  );
  c.carregarEntregasRS = async () => {
    recargas++;
  };
  await lote(c, ['a', 'b'], 'mover', { destino: 'teste_logico' });
  assert.deepEqual(pedidos, [
    ['a', 'teste_logico'],
    ['b', 'teste_logico'],
  ]);
  assert.equal(emails(c).length, 2);
  assert.ok(
    emails(c)[0].corpoHtml.includes('entrega.html?t=a') && emails(c)[1].corpoHtml.includes('entrega.html?t=b'),
    'o link é pessoal de cada um'
  );
  assert.equal(recargas, 1);
  assert.equal(c.__toasts.length, 1);
});

test('uma falha do e-mail da etapa de resultado entra no relatório, marcada para o "Reenviar" da ficha', async () => {
  const c = ctx('owner');
  const vaga = { ...VAGA, etapasAtivas: ['teste_logico'] };
  cenario(c, [cand('a', 'nova')], vaga);
  c.pedirEntregaRS = async () => ({ ok: true, link: 'https://x.test/e', prazoISO: '2026-12-01T00:00:00Z' });
  c.carregarEntregasRS = async () => {};
  c.__responder = () => ({ data: null, error: { message: 'x' } });
  await lote(c, ['a'], 'mover', { destino: 'teste_logico' });
  assert.deepEqual(
    plano(rodar(c, '_rsLote.resultado.falhasEmail')).map((f) => f.tipo),
    ['entrega']
  );
  assert.ok(rodar(c, 'painelLoteHtml(state.rs.requisicoes[0])').includes('Reenviar'));
});

// ======================= permissões =======================
test('só Administrador e RH: líder e colaborador não veem a seleção e não conseguem iniciar nem executar', async () => {
  for (const papel of ['lider', 'colaborador', null]) {
    const c = ctx(papel);
    cenario(c, [cand('a', 'nova')]);
    assert.equal(rodar(c, 'barraLoteHtml(state.rs.requisicoes[0])'), '', String(papel));
    assert.equal(rodar(c, 'caixaSelecaoCartaoHtml(state.rs.candidatos[0])'), '');
    rodar(c, 'alternarSelecaoRS()');
    assert.equal(rodar(c, '_rsSelecaoAtiva'), false);
    rodar(
      c,
      '_rsSelecionados = ["a"]; _rsLote = { vagaId: "v1", acao: "avancar", destino: "", motivo: "", fase: "confirmar", plano: planejarLoteRS({ candidatos: state.rs.candidatos, vaga: state.rs.requisicoes[0], acao: "avancar" }), progresso: null, resultado: null };'
    );
    await rodar(c, 'executarLoteRS()');
    assert.equal(estado(c)[0].etapa, 'nova', 'nada foi movido');
    assert.equal(emails(c).length, 0);
  }
});

// ======================= seleção e tela =======================
test('seleção: marcar, marcar todos de uma fase (só os ativos dela), limpar e sair; trocar de vaga limpa tudo', () => {
  const c = ctx();
  cenario(c, [
    cand('a', 'nova'),
    cand('b', 'triagem'),
    cand('d', 'entrevista_fit'),
    cand('r', 'nova', { reprovado: true }),
  ]);
  rodar(c, 'alternarSelecaoRS()');
  assert.equal(rodar(c, '_rsSelecaoAtiva'), true);
  rodar(c, "marcarCandidatoLoteRS('d', true)");
  assert.deepEqual(plano(rodar(c, '_rsSelecionados')), ['d']);
  rodar(c, "marcarFaseLoteRS('entrada', true)");
  assert.deepEqual(
    plano(rodar(c, '_rsSelecionados')).sort(),
    ['a', 'b', 'd'],
    'a fase Entrada tem a e b; o reprovado r não entra'
  );
  rodar(c, "marcarFaseLoteRS('entrada', false)");
  assert.deepEqual(plano(rodar(c, '_rsSelecionados')), ['d']);
  rodar(c, "marcarCandidatoLoteRS('d', false)");
  assert.deepEqual(plano(rodar(c, '_rsSelecionados')), []);
  rodar(c, "marcarCandidatoLoteRS('a', true); selecionarVagaRS('v1');");
  assert.deepEqual(
    [rodar(c, '_rsSelecaoAtiva'), plano(rodar(c, '_rsSelecionados')), rodar(c, '_rsLote')],
    [false, [], null]
  );
});

test('a barra: mostra quantos estão marcados e só liga as ações com alguém marcado', () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'nova')]);
  const vaga = 'state.rs.requisicoes[0]';
  assert.ok(rodar(c, `barraLoteHtml(${vaga})`).includes('Selecionar vários'));
  rodar(c, '_rsSelecaoAtiva = true;');
  let h = rodar(c, `barraLoteHtml(${vaga})`);
  assert.ok(
    h.includes('0 selecionado(s)') && (h.match(/ disabled/g) || []).length >= 3,
    'sem ninguém marcado as 3 ações ficam desligadas'
  );
  rodar(c, '_rsSelecionados = ["a", "b"];');
  h = rodar(c, `barraLoteHtml(${vaga})`);
  assert.ok(h.includes('2 selecionado(s)'));
  assert.ok(/Avançar para a próxima etapa<\/button>/.test(h) && !/onclick="abrirLoteRS\('avancar'\)" disabled/.test(h));
  assert.ok(h.includes('aria-label="Seleção de candidatos"') && h.includes('aria-live="polite"'));
});

test('cartão e cabeçalho de fase: caixas com nome acessível; sem o modo de seleção não aparece nada', () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova', { nome: 'Ana <b>Maria</b>' })]);
  assert.equal(rodar(c, 'caixaSelecaoCartaoHtml(state.rs.candidatos[0])'), '');
  rodar(c, '_rsSelecaoAtiva = true;');
  const h = rodar(c, 'caixaSelecaoCartaoHtml(state.rs.candidatos[0])');
  assert.ok(h.includes('aria-label="Selecionar Ana &lt;b&gt;Maria&lt;/b&gt;"') && !h.includes('<b>Maria'));
  const fase = rodar(c, 'cabecalhoFaseLoteHtml(FASES_PROCESSO_RS[0], state.rs.candidatos)');
  assert.ok(fase.includes('aria-label="Selecionar todos de 1. Entrada"'));
  assert.equal(rodar(c, 'cabecalhoFaseLoteHtml(FASES_PROCESSO_RS[0], [])'), '');
});

test('o quadro da vaga traz a barra, as caixas dos cartões e o seletor de fase quando a seleção está ligada', () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova'), cand('b', 'triagem')]);
  assert.ok(rodar(c, 'quadroDaVagaHtml(state.rs.requisicoes[0])').includes('Selecionar vários'));
  rodar(c, '_rsSelecaoAtiva = true; _rsSelecionados = ["a"];');
  const h = rodar(c, 'quadroDaVagaHtml(state.rs.requisicoes[0])');
  assert.ok(h.includes('1 selecionado(s)'));
  assert.equal((h.match(/aria-label="Selecionar Cand [ab]"/g) || []).length, 2);
  assert.ok(h.includes('Selecionar todos de 1. Entrada'));
});

test('o painel de confirmação: título, destinos, e-mails, avisos, ignorados e botões; escapa nomes e motivo', () => {
  const c = ctx();
  const vaga = { ...VAGA, etapasAtivas: ['triagem', 'disc_galt'] };
  cenario(
    c,
    [
      cand('a', 'nova', { nome: '<img src=x onerror=alert(1)>' }),
      cand('b', 'nova', { email: '' }),
      cand('r', 'nova', { reprovado: true, nome: 'Rita' }),
    ],
    vaga
  );
  rodar(c, '_rsSelecaoAtiva = true; _rsSelecionados = ["a","b","r"]; abrirLoteRS("mover");');
  const v = 'state.rs.requisicoes[0]';
  let h = rodar(c, `painelLoteHtml(${v})`);
  assert.ok(
    h.includes('Escolha a etapa de destino.') && /onclick="executarLoteRS\(\)" disabled/.test(h),
    'sem destino não dá para confirmar'
  );
  rodar(c, 'mudarDestinoLoteRS("disc_galt")');
  h = rodar(c, `painelLoteHtml(${v})`);
  assert.ok(
    h.includes('Mover 2 candidato(s) para') &&
      h.includes('<b>Vão para:</b>') &&
      h.includes('1</b> candidato(s) vão receber e-mail.') &&
      h.includes('1 não têm e-mail cadastrado')
  );
  assert.ok(h.includes('Atenção:') && h.includes('1 serão ignorados') && h.includes('Rita — já está reprovado(a)'));
  assert.ok(
    h.includes('Confirmar e enviar') &&
      h.includes('cancelarLoteRS()') &&
      !/onclick="executarLoteRS\(\)" disabled/.test(h)
  );
  assert.ok(!h.includes('<img src=x'), 'nome escapado');
  rodar(c, 'cancelarLoteRS(); abrirLoteRS("reprovar"); mudarMotivoLoteRS("<script>x</script>");');
  rodar(c, '_rsLote.fase = "confirmar"; recalcularLoteRS();');
  h = rodar(c, `painelLoteHtml(${v})`);
  assert.ok(h.includes('Confirmar reprovação') && h.includes('&lt;script&gt;') && !h.includes('<script>x'));
});

test('o painel de andamento anuncia o progresso para leitor de tela', () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova')]);
  rodar(
    c,
    '_rsSelecaoAtiva = true; _rsSelecionados = ["a"]; abrirLoteRS("avancar"); _rsLote.fase = "executando"; _rsLote.progresso = { feitos: 3, total: 12 };'
  );
  const h = rodar(c, 'painelLoteHtml(state.rs.requisicoes[0])');
  assert.ok(
    h.includes('role="status"') &&
      h.includes('aria-live="polite"') &&
      h.includes('Processando 3 de 12') &&
      h.includes('Não feche esta página')
  );
  assert.ok(h.includes('width:25%'));
});

test('a movimentação INDIVIDUAL continua igual (mesmos avisos), usando o mesmo código do lote', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova')]);
  rodar(c, "moverEtapaCandidatoRS('a', 'triagem')");
  assert.equal(estado(c)[0].etapa, 'triagem');
  assert.equal(c.__toasts[0], 'Etapa atualizada — e-mail enviado a Cand a.');
  c.prompt = () => 'Sem perfil';
  rodar(c, "reprovarCandidatoRS('a')");
  assert.equal(estado(c)[0].historico.at(-1).observacao, 'Sem perfil');
  assert.equal(c.__toasts[1], 'Candidato reprovado — e-mail enviado a Cand a.');
});

test('o painel FINAL escapa os nomes dos e-mails que falharam, dos pulados e dos erros (sem injeção de HTML)', () => {
  const c = ctx();
  cenario(c, [cand('a', 'nova')]);
  rodar(
    c,
    `_rsLote = { vagaId: 'v1', acao: 'avancar', destino: '', motivo: '', fase: 'pronto', plano: null, progresso: null, resultado: { movidos: 1, falhasEmail: [{ id: 'a', nome: '<img src=x onerror=alert(1)>', etapa: 'triagem', tipo: 'etapa' }], pulados: [{ nome: '<script>1</script>', motivo: '<b>x</b>' }], erros: [{ nome: '<i>e</i>', motivo: 'erro' }] } };`
  );
  const h = rodar(c, 'painelLoteHtml(state.rs.requisicoes[0])');
  assert.ok(
    !h.includes('<img src=x') && !h.includes('<script>1') && !h.includes('<b>x</b>') && !h.includes('<i>e</i>')
  );
  assert.ok(h.includes('&lt;img') && h.includes('&lt;script&gt;') && h.includes('&lt;i&gt;e'));
});

test('a reprovação em lote registra QUEM reprovou e QUANDO, para cada candidato', async () => {
  const c = ctx();
  cenario(c, [cand('a', 'triagem'), cand('b', 'nova')]);
  await lote(c, ['a', 'b'], 'reprovar', { motivo: 'Sem perfil' });
  for (const x of estado(c)) {
    const h = x.historico.at(-1);
    assert.equal(h.autorId, 'p1');
    assert.ok(h.em && !Number.isNaN(Date.parse(h.em)));
  }
});
