// =========================================================================
// E-mail de cada etapa: ao mover o candidato de fase, o e-mail dele traz COMO FAZER (passo a passo padrão),
// seguido das orientações e links configurados (da vaga ou da empresa). Também: a pré-visualização do e-mail ao
// configurar a etapa e o aviso antes de mandar alguém para uma etapa que depende de links ainda não configurados.
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
  ]);
  c.meuPapelReal = papel;
  c.meuPerfilId = 'perfil1';
  c.URL = URL;
  c.__toasts = [];
  c.__renders = 0;
  c.__enviados = [];
  c.__perguntas = [];
  c.confirm = (m) => (c.__perguntas.push(m), true);
  c.showToast = (t) => c.__toasts.push(t);
  c.render = () => c.__renders++;
  c.registrarAuditoria = () => {};
  c.sb = {
    functions: { invoke: async (nome, o) => (c.__enviados.push({ nome, body: o.body }), { data: {}, error: null }) },
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const esperar = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const montar = (c, extra) =>
  plano(rodar(c, `montarEmailEtapaRS(${J({ nome: 'Ana', nomeVaga: 'Vendedor', cfg: {}, ...extra })})`));
const CFG = {
  instrucoes: 'Envie o resultado para rh@empresa.com',
  links: [{ rotulo: 'Teste DISC', url: 'https://exemplo.com/disc' }],
};

function cenario(c, { vaga = {}, empresa = {}, etapa = 'triagem' } = {}) {
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor' }]; state.estrutura = [];
    state.rs = { requisicoes: [${J({ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', status: 'aprovada', ...vaga })}], configEtapas: ${J(empresa)},
      candidatos: [{ id: 'a', vagaId: 'v1', nome: 'Ana', email: 'ana@x.com', etapa: ${J(etapa)}, reprovado: false, historico: [] }] };
    _rsVideos = []; _rsCandidaturasPendentes = { v1: [] };`
  );
}

// ======================= o "como fazer" =======================
test('toda etapa que manda e-mail tem "como fazer" (título e passos de verdade); as internas não têm', () => {
  const c = ctx();
  const etapas = plano(rodar(c, 'ETAPAS_RS'));
  const guia = plano(rodar(c, 'COMO_FAZER_ETAPA_RS'));
  for (const e of etapas) {
    if (e.interna) assert.ok(!guia[e.id], `a etapa interna ${e.id} não manda e-mail: não tem passo a passo`);
    else {
      assert.ok(guia[e.id], `a etapa ${e.nome} está sem "como fazer"`);
      assert.ok(guia[e.id].titulo.length > 5 && guia[e.id].passos.length >= 2, e.id);
      guia[e.id].passos.forEach((p) =>
        assert.ok(p.length >= 20 && /[.]$/.test(p), `${e.id}: passo curto ou sem ponto final: "${p}"`)
      );
    }
  }
  for (const id of Object.keys(guia))
    assert.ok(rodar(c, `RS_EMAIL_POR_ETAPA[${J(id)}] !== undefined`), `${id} tem passo a passo mas não tem e-mail`);
});

test('o passo a passo padrão não inventa links, e-mails nem endereços (isso é da empresa, em "Orientações")', () => {
  const c = ctx();
  const guia = plano(rodar(c, 'COMO_FAZER_ETAPA_RS'));
  for (const [id, g] of Object.entries(guia))
    g.passos.forEach((p) =>
      assert.ok(!/<|>|https?:|www\.|@|\d{2}\/\d{2}/.test(p), `${id}: "${p}" traz HTML, link, e-mail ou data`)
    );
});

test('o e-mail de cada etapa traz o texto da etapa, DEPOIS o "como fazer" e, por último, as orientações da empresa', () => {
  const c = ctx();
  const etapas = plano(rodar(c, 'ETAPAS_RS')).filter((e) => !e.interna);
  for (const e of etapas) {
    const m = montar(c, { etapa: e.id, cfg: CFG });
    assert.ok(m && m.assunto.length > 5, e.id);
    const guia = plano(rodar(c, `COMO_FAZER_ETAPA_RS[${J(e.id)}]`));
    const iTexto = m.corpoHtml.indexOf('Olá, Ana');
    const iComo = m.corpoHtml.indexOf(`<b>${guia.titulo}:</b>`);
    const iOrient = m.corpoHtml.indexOf('Envie o resultado para rh@empresa.com');
    assert.ok(
      iTexto >= 0 && iTexto < 10 && iComo > iTexto && iOrient > iComo,
      `${e.id}: ordem errada (${iTexto}, ${iComo}, ${iOrient})`
    );
    guia.passos.forEach((p) => assert.ok(m.corpoHtml.includes(`<li>${p}</li>`), `${e.id}: falta o passo "${p}"`));
    assert.ok(m.corpoHtml.includes('<ol>') && m.corpoHtml.includes('href="https://exemplo.com/disc"'), e.id);
  }
});

test('sem orientações configuradas o candidato AINDA recebe o passo a passo (e é avisado de que os detalhes virão da equipe)', () => {
  const c = ctx();
  for (const id of ['disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica']) {
    const m = montar(c, { etapa: id, cfg: {} });
    assert.ok(m.corpoHtml.includes('<b>Como fazer:</b>') && m.corpoHtml.includes('<ol>'), id);
    assert.ok(
      m.corpoHtml.includes('em breve') && !m.corpoHtml.includes('logo abaixo') && !m.corpoHtml.includes('<ul>'),
      `${id}: sem orientações`
    );
  }
  const com = montar(c, { etapa: 'disc_galt', cfg: CFG });
  assert.ok(com.corpoHtml.includes('logo abaixo') && !com.corpoHtml.includes('em breve'));
});

test('etapas que não pedem nada do candidato dizem isso com clareza ("O que acontece agora")', () => {
  const c = ctx();
  for (const id of ['nova', 'triagem', 'escolha']) {
    const m = montar(c, { etapa: id });
    assert.ok(
      m.corpoHtml.includes('<b>O que acontece agora:</b>') &&
        /não precisa fazer nada|não precisa fazer nada/i.test(m.corpoHtml),
      id
    );
  }
  assert.ok(montar(c, { etapa: 'entrevista_fit' }).corpoHtml.includes('<b>Como se preparar:</b>'));
  assert.ok(montar(c, { etapa: 'proposta' }).corpoHtml.includes('<b>O que fazer agora:</b>'));
});

test('prova prática: enunciado, prazo e links vêm DEPOIS do passo a passo; os critérios de avaliação nunca vão ao candidato', () => {
  const c = ctx();
  const cfg = {
    instrucoes: 'Monte uma proposta comercial.',
    prazoDias: 5,
    links: [{ rotulo: 'Briefing', url: 'https://exemplo.com/b' }],
    criterios: [{ descricao: 'Clareza', peso: 4 }],
  };
  const m = plano(
    rodar(
      c,
      `montarEmailEtapaRS(Object.assign(${J({ nome: 'Ana', nomeVaga: 'Vendedor', etapa: 'prova_pratica', cfg })}, { hoje: new Date(2026, 9, 10) }))`
    )
  );
  const h = m.corpoHtml;
  assert.ok(
    h.indexOf('<b>Como fazer:</b>') < h.indexOf('Monte uma proposta comercial.') &&
      h.indexOf('Monte uma proposta comercial.') < h.indexOf('Prazo de entrega')
  );
  assert.ok(!h.includes('Clareza') && !/crit[ée]rio/i.test(h));
});

test('nome e vaga saem escapados; textos HTML da configuração também; o passo a passo é texto fixo', () => {
  const c = ctx();
  const m = montar(c, {
    etapa: 'disc_galt',
    nome: 'Ana <img src=x onerror=alert(1)>',
    nomeVaga: 'Vaga <script>x</script>',
    cfg: { instrucoes: '<b>negrito</b> <script>y</script>', links: [] },
  });
  assert.ok(
    !m.corpoHtml.includes('<img') && !m.corpoHtml.includes('<script>') && !m.corpoHtml.includes('<b>negrito</b>')
  );
  assert.equal(
    plano(rodar(c, "montarEmailEtapaRS({ nome: 'A', nomeVaga: 'B', etapa: 'inexistente', cfg: {} })")),
    null
  );
});

// ======================= o envio de verdade =======================
test('mover/avançar manda ao candidato o MESMO e-mail que o montador gera (com o "como fazer" e as orientações da vaga)', async () => {
  const c = ctx();
  cenario(c, { vaga: { etapasConfig: { disc_galt: CFG } } });
  await rodar(c, "enviarEmailEtapaRS(state.rs.candidatos[0], 'disc_galt')");
  assert.equal(c.__enviados.length, 1);
  const enviado = c.__enviados[0];
  assert.equal(enviado.nome, 'enviar-email');
  assert.equal(enviado.body.destinatario, 'ana@x.com');
  const esperado = plano(
    rodar(
      c,
      "montarEmailEtapaRS({ nome: 'Ana', nomeVaga: 'Vendedor', etapa: 'disc_galt', cfg: configEfetivaEtapaRS(state.rs.requisicoes[0], 'disc_galt') })"
    )
  );
  assert.equal(enviado.body.assunto, esperado.assunto);
  assert.equal(enviado.body.corpoHtml, esperado.corpoHtml);
  assert.ok(
    enviado.body.corpoHtml.includes('<b>Como fazer:</b>') &&
      enviado.body.corpoHtml.includes('Envie o resultado para rh@empresa.com')
  );
});

test('a orientação da VAGA vale no lugar da da empresa no e-mail; sem a da vaga, vale a da empresa; sem e-mail ou em etapa interna, nada é enviado', async () => {
  const c = ctx();
  cenario(c, {
    vaga: { etapasConfig: { disc_galt: { instrucoes: 'DA VAGA', links: [] } } },
    empresa: { disc_galt: { instrucoes: 'DA EMPRESA', links: [] } },
  });
  await rodar(c, "enviarEmailEtapaRS(state.rs.candidatos[0], 'disc_galt')");
  assert.ok(
    c.__enviados[0].body.corpoHtml.includes('DA VAGA') && !c.__enviados[0].body.corpoHtml.includes('DA EMPRESA')
  );
  cenario(c, { empresa: { disc_galt: { instrucoes: 'DA EMPRESA', links: [] } } });
  await rodar(c, "enviarEmailEtapaRS(state.rs.candidatos[0], 'disc_galt')");
  assert.ok(c.__enviados[1].body.corpoHtml.includes('DA EMPRESA'));
  const n = c.__enviados.length;
  await rodar(c, "enviarEmailEtapaRS(state.rs.candidatos[0], 'redes_sociais')");
  rodar(c, "state.rs.candidatos[0].email = ''");
  await rodar(c, "enviarEmailEtapaRS(state.rs.candidatos[0], 'disc_galt')");
  assert.equal(c.__enviados.length, n);
});

// ======================= a pré-visualização =======================
test('pré-visualização: mostra o assunto e o e-mail com um nome de exemplo, o passo a passo e as orientações; vídeo e etapas internas explicam', () => {
  const c = ctx();
  const p = (etapa, nomeVaga, cfg) => rodar(c, `previaEmailEtapaRS(${J(etapa)}, ${J(nomeVaga)}, ${J(cfg)})`);
  const h = p('disc_galt', 'Analista', CFG);
  assert.ok(
    h.includes('<b>Assunto:</b>') &&
      h.includes('Olá, Maria') &&
      h.includes('Analista') &&
      h.includes('<b>Como fazer:</b>') &&
      h.includes('Envie o resultado para rh@empresa.com')
  );
  assert.ok(p('disc_galt', '', {}).includes('Vendedor'), 'sem nome de vaga usa um exemplo');
  assert.ok(p('video', 'X', {}).includes('pedido de vídeo') && p('video', 'X', {}).includes('2 minutos'));
  assert.ok(p('redes_sociais', 'X', {}).includes('não envia e-mail'));
  assert.ok(!p('disc_galt', '<script>x</script>', {}).includes('<script>'));
});

test('as telas de configuração (empresa e vaga) mostram "Ver o e-mail que o candidato recebe" em cada etapa, refletindo o que está salvo', () => {
  const c = ctx('rh');
  cenario(c, {
    vaga: { etapasConfig: { disc_galt: { instrucoes: 'TEXTO SALVO NA VAGA', links: [] } } },
    empresa: { teste_logico: { instrucoes: 'TEXTO SALVO NA EMPRESA', links: [] } },
  });
  const painel = rodar(c, 'rsConfigEtapasPainelHtml()');
  assert.equal(
    (painel.match(/Ver o e-mail que o candidato recebe/g) || []).length,
    8,
    'uma pré-visualização por etapa do painel da empresa'
  );
  assert.ok(/Ver o e-mail que o candidato recebe[\s\S]*?Abra cada link de teste/.test(painel));
  const iTeste = painel.indexOf('Ver o e-mail', painel.indexOf('Teste lógico'));
  assert.ok(
    painel.slice(iTeste, iTeste + 2500).includes('TEXTO SALVO NA EMPRESA'),
    'a prévia do teste lógico mostra o texto salvo'
  );
  const vaga = rodar(c, 'etapasVagaOrientacoesHtml(state.rs.requisicoes[0])');
  assert.equal(
    (vaga.match(/Ver o e-mail que o candidato recebe/g) || []).length,
    9,
    'uma por etapa configurável da vaga'
  );
  assert.ok(vaga.includes('TEXTO SALVO NA VAGA'));
});

// ======================= aviso antes de mandar sem links =======================
test('as etapas que dependem de links são exatamente: DISC/GALT, teste lógico e prova teórica', () => {
  assert.deepEqual(plano(rodar(ctx(), 'ETAPAS_QUE_PRECISAM_ORIENTACAO_RS')), [
    'disc_galt',
    'teste_logico',
    'prova_teorica',
  ]);
});

test('mover para uma etapa SEM links nem orientações pergunta antes; recusar não move e refaz a tela; aceitar move', () => {
  for (const etapa of ['disc_galt', 'teste_logico', 'prova_teorica']) {
    const c = ctx();
    cenario(c, { etapa: 'triagem' });
    c.confirm = (m) => (c.__perguntas.push(m), false);
    rodar(c, `moverEtapaCandidatoRS('a', ${J(etapa)})`);
    assert.equal(c.__perguntas.length, 1, etapa);
    assert.match(c.__perguntas[0], /ainda não tem links nem orientações configurados/);
    assert.match(c.__perguntas[0], /Configure em/);
    assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'triagem', `${etapa}: a recusa não move`);
    assert.ok(c.__renders >= 1);
    c.confirm = () => true;
    rodar(c, `moverEtapaCandidatoRS('a', ${J(etapa)})`);
    assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), etapa);
  }
});

test('com orientações da empresa OU da vaga, mover não pergunta; as outras etapas nunca perguntam por isso', async () => {
  const c = ctx();
  cenario(c, { empresa: { disc_galt: { instrucoes: 'DA EMPRESA', links: [] } } });
  rodar(c, "moverEtapaCandidatoRS('a', 'disc_galt')");
  cenario(c, { vaga: { etapasConfig: { teste_logico: { instrucoes: 'DA VAGA', links: [] } } } });
  rodar(c, "moverEtapaCandidatoRS('a', 'teste_logico')");
  for (const etapa of ['entrevista_fit', 'entrevista_final', 'escolha', 'proposta']) {
    cenario(c, {});
    rodar(c, `moverEtapaCandidatoRS('a', ${J(etapa)})`);
  }
  await esperar(30);
  assert.equal(c.__perguntas.length, 0);
});

test('o botão Avançar do quadro passa pelo mesmo aviso (a etapa seguinte sem links pergunta antes)', () => {
  const c = ctx();
  cenario(c, { etapa: 'triagem' });
  c.confirm = (m) => (c.__perguntas.push(m), false);
  rodar(c, "avancarCandidatoRS('a')"); // a próxima da triagem é DISC/GALT, sem links
  assert.equal(c.__perguntas.length, 1);
  assert.equal(rodar(c, 'state.rs.candidatos[0].etapa'), 'triagem');
});

test('integração: o envio passa pelo montador único e nenhum e-mail promete só "a equipe enviará em breve" sem o passo a passo', () => {
  const rs = ler('js/40-page-rs.js');
  assert.ok(/const email = montarEmailEtapaRS\(\{/.test(rs));
  assert.ok(!rs.includes("'Nossa equipe enviará as orientações em breve.'"));
  assert.ok(ler('js/45-rs-etapas.js').includes('previaEmailEtapaRS('));
});
