// =========================================================================
// Acessibilidade básica (js/51-acessibilidade.js + css + app.html), testada em uma página de verdade (jsdom) e nas
// telas REAIS do recrutamento. Garantias: todo campo ganha nome; elemento clicável vira acionável pelo teclado; botão
// só com ícone tem nome; o menu diz onde você está; só mexe em atributos; nunca derruba a tela; as cores de texto têm
// contraste mínimo de 4,5:1.
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { carregarArquivos } = require('./helpers/carregar-arquivos.js');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const SCRIPT = ler('js/51-acessibilidade.js');
const esperarQuadro = (w) => new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));

async function pagina(html) {
  const dom = new JSDOM(
    `<!doctype html><html lang="pt-BR"><body><div id="app">${html}</div><div id="toast"></div></body></html>`,
    { runScripts: 'dangerously', pretendToBeVisual: true }
  );
  if (dom.window.document.readyState !== 'complete') await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.eval(SCRIPT);
  return dom;
}
const $ = (dom, seletor) => dom.window.document.querySelector(seletor);
const $$ = (dom, seletor) => [...dom.window.document.querySelectorAll(seletor)];

// Um campo "tem nome" se: aria-label/labelledby, está dentro de um <label>, ou há um <label for> apontando para ele.
function semNome(doc) {
  return [
    ...doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'),
  ].filter((c) => {
    if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.closest('label')) return false;
    return !(c.id && doc.querySelector(`label[for="${c.id}"]`));
  });
}

// ======================= rótulos =======================
test('cada <label> é ligado ao seu campo (for/id), em input, select e textarea; ids novos são únicos', async () => {
  const dom = await pagina(
    `<div class="field"><label>Nome</label><input></div><div class="field"><label>Tipo</label><select><option>a</option></select></div><div class="field"><label>Obs</label><textarea></textarea></div>`
  );
  const rotulos = $$(dom, 'label');
  assert.ok(rotulos.every((l) => l.getAttribute('for')));
  const ids = rotulos.map((l) => l.getAttribute('for'));
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual([$$(dom, 'input')[0].id, $$(dom, 'select')[0].id, $$(dom, 'textarea')[0].id], ids);
  assert.deepEqual(semNome(dom.window.document), []);
});

test('respeita o que já existe: id do campo preservado, "for" existente intacto, rótulo que envolve o campo não muda', async () => {
  const dom = await pagina(
    `<div><label>Cargo</label><select id="rs_req_cargo"></select></div><div><label for="x">Já ligado</label><input id="x"></div><label><input type="checkbox"> Confidencial</label>`
  );
  assert.equal($(dom, 'label').getAttribute('for'), 'rs_req_cargo');
  assert.equal($(dom, '#rs_req_cargo').id, 'rs_req_cargo');
  assert.equal($(dom, 'label[for="x"]').getAttribute('for'), 'x');
  const envolvente = $$(dom, 'label')[2];
  assert.equal(envolvente.hasAttribute('for'), false);
  assert.equal($(dom, 'input[type="checkbox"]').hasAttribute('id'), false);
});

test('um rótulo NÃO captura o campo de outro rótulo (rótulo seguido de rótulo que envolve campo)', async () => {
  const dom = await pagina(`<div><label>Sozinho</label><label><input type="checkbox"> Outro</label></div>`);
  assert.equal($$(dom, 'label')[0].hasAttribute('for'), false);
  assert.equal($(dom, 'input').hasAttribute('id'), false);
});

test('dois rótulos seguidos e um campo: o campo fica com o rótulo MAIS PRÓXIMO (o segundo), e o primeiro não o captura', async () => {
  const dom = await pagina(
    `<div><label id="um">Primeiro</label><label id="dois">Segundo</label><input id="campo"></div>`
  );
  assert.equal($(dom, '#dois').getAttribute('for'), 'campo');
  assert.equal($(dom, '#um').hasAttribute('for'), false);
});

test('campo sem rótulo usa o placeholder ou o título como nome; sem nenhum dos dois, fica como está', async () => {
  const dom = await pagina(
    `<input placeholder="Buscar pessoa"><input title="Filtrar"><input><input type="hidden" placeholder="x"><button type="button">ok</button>`
  );
  const campos = $$(dom, 'input');
  assert.equal(campos[0].getAttribute('aria-label'), 'Buscar pessoa');
  assert.equal(campos[1].getAttribute('aria-label'), 'Filtrar');
  assert.equal(campos[2].hasAttribute('aria-label'), false);
  assert.equal(campos[3].hasAttribute('aria-label'), false, 'campo oculto não precisa de nome');
});

test('rodar de novo não muda nada (idempotente) e não cria ids novos', async () => {
  const dom = await pagina(`<div><label>Nome</label><input></div><div role="x" onclick="a()">x</div>`);
  const antes = dom.window.document.body.innerHTML;
  dom.window.aplicarAcessibilidade(dom.window.document);
  dom.window.aplicarAcessibilidade(dom.window.document);
  assert.equal(dom.window.document.body.innerHTML, antes);
});

// ======================= teclado =======================
test('elemento clicável que não é botão vira "botão" focável; botão, link, resumo e quem já tem papel ficam intactos', async () => {
  const dom =
    await pagina(`<div id="a" onclick="x()">Abrir</div><span id="b" onclick="x()">Ver</span><li id="c" onclick="x()">Item</li>
    <button id="d" onclick="x()">Botão</button><a id="e" href="#" onclick="x()">Link</a><div id="f" role="tab" onclick="x()">Aba</div>
    <div id="g" onclick="x()" tabindex="-1">Já focável</div><label id="h"><span id="i" onclick="x()">dentro de rótulo</span></label><button><span id="j" onclick="x()">dentro de botão</span></button>`);
  for (const id of ['a', 'b', 'c']) {
    assert.equal($(dom, `#${id}`).getAttribute('role'), 'button', id);
    assert.equal($(dom, `#${id}`).getAttribute('tabindex'), '0', id);
  }
  assert.equal($(dom, '#d').hasAttribute('role') || $(dom, '#d').hasAttribute('tabindex'), false);
  assert.equal($(dom, '#e').hasAttribute('tabindex'), false);
  assert.equal($(dom, '#f').getAttribute('role'), 'tab');
  assert.equal($(dom, '#g').getAttribute('tabindex'), '-1', 'não sobrescreve o que o autor definiu');
  assert.equal($(dom, '#i').hasAttribute('tabindex'), false);
  assert.equal($(dom, '#j').hasAttribute('tabindex'), false);
});

test('linhas e células de tabela clicáveis ganham foco, mas mantêm o papel de tabela', async () => {
  const dom = await pagina(
    `<table><tbody><tr id="l" onclick="x()"><td id="c" onclick="y()">a</td></tr></tbody></table>`
  );
  assert.equal($(dom, '#l').getAttribute('tabindex'), '0');
  assert.equal($(dom, '#l').hasAttribute('role'), false);
  assert.equal($(dom, '#c').getAttribute('tabindex'), '0');
});

test('Enter e Espaço acionam o "botão"; outras teclas e campos de texto não; Espaço não rola a página', async () => {
  const dom = await pagina(
    `<div id="a" onclick="window.__cliques=(window.__cliques||0)+1">Abrir</div><input id="campo" onclick="window.__cliques=(window.__cliques||0)+100">`
  );
  const w = dom.window;
  const tecla = (alvo, key) => {
    const ev = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    alvo.dispatchEvent(ev);
    return ev;
  };
  tecla($(dom, '#a'), 'Enter');
  assert.equal(w.__cliques, 1);
  const espaco = tecla($(dom, '#a'), ' ');
  assert.equal(w.__cliques, 2);
  assert.equal(espaco.defaultPrevented, true, 'o Espaço não pode rolar a página');
  tecla($(dom, '#a'), 'a');
  tecla($(dom, '#a'), 'Tab');
  assert.equal(w.__cliques, 2);
  tecla($(dom, '#campo'), 'Enter');
  assert.equal(w.__cliques, 2, 'campo de texto não é "botão"');
});

// ======================= nomes e estrutura =======================
test('botão só com ícone ou emoji ganha nome (título ou significado do símbolo); botão com texto fica como está', async () => {
  const dom = await pagina(
    `<button id="a" title="Notificações">🔔</button><button id="b">×</button><button id="c">←</button><button id="d">Salvar</button><button id="e">🔔</button><button id="f" title="Mais" aria-label="Já tem">+</button>`
  );
  assert.equal($(dom, '#a').getAttribute('aria-label'), 'Notificações');
  assert.equal($(dom, '#b').getAttribute('aria-label'), 'Fechar');
  assert.equal($(dom, '#c').getAttribute('aria-label'), 'Voltar');
  assert.equal($(dom, '#d').hasAttribute('aria-label'), false);
  assert.equal($(dom, '#e').hasAttribute('aria-label'), false, 'sem título nem significado conhecido, não adivinha');
  assert.equal($(dom, '#f').getAttribute('aria-label'), 'Já tem');
});

test('imagem sem alt vira decorativa (alt vazio); com alt não muda; <th> ganha scope="col"', async () => {
  const dom = await pagina(
    `<img id="a" src="x.png"><img id="b" src="y.png" alt="Logotipo"><table><thead><tr><th id="t">Nome</th><th id="u" scope="row">Linha</th></tr></thead></table>`
  );
  assert.equal($(dom, '#a').getAttribute('alt'), '');
  assert.equal($(dom, '#b').getAttribute('alt'), 'Logotipo');
  assert.equal($(dom, '#t').getAttribute('scope'), 'col');
  assert.equal($(dom, '#u').getAttribute('scope'), 'row');
});

test('menu: o item atual diz aria-current, o bloqueado diz aria-disabled, o grupo diz se está aberto; o menu tem nome', async () => {
  const dom = await pagina(
    `<nav class="steps"><button class="step-group-toggle" id="g1"><span class="step-group-chevron aberto">▾</span>Pessoas</button><button class="step-btn active" id="atual">Colaboradores</button><button class="step-btn locked" id="trancado">Ciclos</button><button class="step-btn" id="outro">Cargos</button><button class="step-group-toggle" id="g2"><span class="step-group-chevron">▸</span>Base</button></nav>`
  );
  assert.equal($(dom, 'nav').getAttribute('aria-label'), 'Menu principal');
  assert.equal($(dom, '#atual').getAttribute('aria-current'), 'page');
  assert.equal($(dom, '#outro').hasAttribute('aria-current'), false);
  assert.equal($(dom, '#trancado').getAttribute('aria-disabled'), 'true');
  assert.deepEqual(
    [$(dom, '#g1').getAttribute('aria-expanded'), $(dom, '#g2').getAttribute('aria-expanded')],
    ['true', 'false']
  );
  // trocou de página: só o novo item fica marcado
  $(dom, '#atual').classList.remove('active');
  $(dom, '#outro').classList.add('active');
  dom.window.aplicarAcessibilidade(dom.window.document);
  assert.deepEqual(
    [$(dom, '#atual').hasAttribute('aria-current'), $(dom, '#outro').getAttribute('aria-current')],
    [false, 'page']
  );
});

test('o conteúdo principal recebe id e foco (destino do link "Pular para o conteúdo")', async () => {
  const dom = await pagina(`<main><p>Olá</p></main>`);
  assert.equal($(dom, 'main').id, 'conteudo-principal');
  assert.equal($(dom, 'main').getAttribute('tabindex'), '-1');
  const preservado = await pagina(`<main id="meu" tabindex="0"></main>`);
  assert.deepEqual([$(preservado, 'main').id, $(preservado, 'main').getAttribute('tabindex')], ['meu', '0']);
});

// ======================= tela que muda =======================
test('quando a tela é redesenhada, o conteúdo novo também é corrigido (uma passada por quadro)', async () => {
  const dom = await pagina(`<p>vazio</p>`);
  const app = $(dom, '#app');
  app.innerHTML = `<div class="field"><label>Nome novo</label><input></div><div onclick="x()">clicável</div>`;
  await esperarQuadro(dom.window);
  assert.ok($(dom, 'label').getAttribute('for') && $(dom, 'input').id);
  assert.equal($(dom, '#app div[onclick]').getAttribute('role'), 'button');
  // desenhar várias vezes seguidas não acumula trabalho nem quebra
  for (let i = 0; i < 20; i++) app.innerHTML = `<div class="field"><label>Campo ${i}</label><input></div>`;
  await esperarQuadro(dom.window);
  assert.ok($(dom, 'label').getAttribute('for'));
});

test('só mexe em ATRIBUTOS: o texto e a estrutura da tela ficam exatamente iguais', async () => {
  const html = `<div class="field"><label>Nome</label><input placeholder="x"></div><button title="t">🔔</button><div onclick="a()">Abrir <b>já</b></div><table><thead><tr><th>A</th></tr></thead></table><img src="a.png">`;
  const dom = await pagina(html);
  const semAtributos = (n) => {
    const copia = n.cloneNode(true);
    const limpa = (e) => {
      if (e.nodeType === 1) {
        for (const a of [...e.attributes]) e.removeAttribute(a.name);
        [...e.children].forEach(limpa);
      }
    };
    limpa(copia);
    return copia.innerHTML;
  };
  const original = new JSDOM(`<div>${html}</div>`).window.document.body.firstChild;
  assert.equal(semAtributos($(dom, '#app')), semAtributos(original));
});

test('NUNCA derruba a tela: erro interno é engolido', async () => {
  const dom = await pagina('<p>x</p>');
  assert.doesNotThrow(() => dom.window.aplicarAcessibilidade({}));
  assert.doesNotThrow(() =>
    dom.window.aplicarAcessibilidade({
      querySelectorAll() {
        throw new Error('boom');
      },
    })
  );
  assert.doesNotThrow(() => dom.window.aplicarAcessibilidade(null));
});

// ======================= as telas REAIS do recrutamento =======================
function ctx() {
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
  Object.assign(c, {
    meuPapelReal: 'owner',
    meuPerfilId: 'p1',
    URL,
    TextDecoder,
    Uint8Array,
    showToast() {},
    render() {},
    registrarAuditoria() {},
    sb: { functions: { invoke: async () => ({ data: {}, error: null }) } },
  });
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);

test('TELAS REAIS: depois do ajuste, NENHUM campo fica sem nome (Recrutamento com cadastro e importação abertos; Processo seletivo com vaga, formulário e configurações)', async () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = [{ id: 'cg', nome: 'Vendedor', desenho: { aprovado: true } }]; state.estrutura = []; state.rs = { requisicoes: [{ id: 'v1', codigo: 'REQ-001', cargoId: 'cg', quantidade: 1, status: 'aprovada', publicada: true }, { id: 'v2', codigo: 'REQ-002', cargoId: 'cg', status: 'pendente' }], configEtapas: {}, candidatos: [{ id: 'a', vagaId: 'v1', nome: 'Ana', email: 'a@x.com', etapa: 'triagem', reprovado: false, historico: [], scorecards: [] }, { id: 'b', vagaId: null, nome: 'Bia', email: 'b@x.com', etapa: null, reprovado: false, historico: [] }] };
    _rsCandidaturasPendentes = { v1: [] }; _rsEntregas = []; _rsVideos = []; _rsNovaRequisicaoAberta = true; _psVagasAberto = true; _rsPessoaFormAberto = true; _rsImportacao = { aberto: true, arquivo: '', preparo: null, erro: '' }; _psFichaAberta = 'a';`
  );
  const telas = { Recrutamento: rodar(c, 'pageRS()'), 'Processo seletivo': rodar(c, 'pageProcessoSeletivoRS()') };
  let totalCampos = 0;
  for (const [nome, html] of Object.entries(telas)) {
    const dom = await pagina(html);
    const campos = $$(dom, 'input:not([type="hidden"]), select, textarea');
    totalCampos += campos.length;
    assert.deepEqual(
      semNome(dom.window.document).map((x) => x.outerHTML.slice(0, 90)),
      [],
      `${nome}: campo sem nome acessível`
    );
  }
  assert.ok(totalCampos >= 25, `esperava testar muitos campos; achei ${totalCampos}`);
});

test('TELAS REAIS: o que é clicável e não é botão nessas telas passa a ser acionável pelo teclado', async () => {
  const c = ctx();
  rodar(
    c,
    `state.cargos = []; state.estrutura = []; state.rs = { requisicoes: [], configEtapas: {}, candidatos: [{ id: 'b', vagaId: null, nome: 'Bia', email: 'b@x.com', etapa: null, reprovado: false, historico: [] }] }; _rsEntregas = []; _rsVideos = [];`
  );
  const dom = await pagina(rodar(c, 'pageRS()') + rodar(c, 'pageProcessoSeletivoRS()'));
  const naoAcionaveis = $$(dom, '[onclick]').filter(
    (e) =>
      !e.matches('button, a[href], input, select, textarea, summary') &&
      !e.closest('button, a[href], summary, label') &&
      !e.hasAttribute('tabindex')
  );
  assert.deepEqual(
    naoAcionaveis.map((e) => e.outerHTML.slice(0, 80)),
    []
  );
});

// ======================= CSS, página e cores =======================
const css = ler('css/style.css');
const variavel = (nome) => new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`).exec(css)[1];
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) =>
  (Math.max(luminancia(a), luminancia(b)) + 0.05) / (Math.min(luminancia(a), luminancia(b)) + 0.05);

test('CONTRASTE: toda cor usada como TEXTO tem pelo menos 4,5:1 sobre os fundos em que aparece', async () => {
  const fundos = ['surface', 'bg', 'surface-2'].map(variavel);
  for (const t of ['ink', 'ink-dim', 'ink-faint', 'gold'])
    for (const f of fundos)
      assert.ok(contraste(variavel(t), f) >= 4.5, `${t} sobre ${f}: ${contraste(variavel(t), f).toFixed(2)}`);
  const pares = [
    ['iniciar-texto', ['surface', 'iniciar-soft']],
    ['desenvolver-texto', ['surface', 'desenvolver-soft']],
    ['alavancar-texto', ['surface', 'alavancar-soft']],
    ['gold', ['gold-soft']],
  ];
  for (const [t, bgs] of pares)
    for (const b of bgs)
      assert.ok(
        contraste(variavel(t), variavel(b)) >= 4.5,
        `${t} sobre ${b}: ${contraste(variavel(t), variavel(b)).toFixed(2)}`
      );
});

test('nenhuma tela nem o CSS usa os tons vivos de status como cor de TEXTO (só nas versões -texto); sem regressão de contraste', async () => {
  const ruim = /(?<![\w-])color:\s*var\(--(?:iniciar|desenvolver|alavancar)\)/;
  assert.ok(!ruim.test(css), 'css/style.css voltou a usar um tom vivo como texto');
  for (const f of fs.readdirSync(path.join(raiz, 'js')))
    if (f.endsWith('.js')) assert.ok(!ruim.test(ler(`js/${f}`)), `js/${f} usa um tom vivo de status como texto`);
});

test('foco visível, "pular para o conteúdo" e movimento reduzido existem no CSS; o foco dos campos não fica escondido pela regra "outline: none"', async () => {
  assert.ok(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--gold\)/.test(css));
  assert.ok(
    /\.field input:focus-visible,\s*\.field select:focus-visible,\s*\.field textarea:focus-visible\s*\{[^}]*outline:/.test(
      css
    )
  );
  assert.ok(/\.skip-link\s*\{[^}]*top:\s*-64px/.test(css) && /\.skip-link:focus\s*\{[^}]*top:\s*8px/.test(css));
  assert.ok(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important[\s\S]*transition-duration: 0\.01ms !important/.test(
      css
    )
  );
});

test('app.html: o link de pular vem ANTES de tudo e aponta para o conteúdo; o aviso na tela é anunciado; idioma pt-BR; o módulo está carregado', async () => {
  const h = ler('app.html');
  assert.ok(
    h.indexOf('class="skip-link"') > 0 &&
      h.indexOf('class="skip-link"') < h.indexOf('id="app"') &&
      /href="#conteudo-principal"/.test(h)
  );
  assert.ok(/<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true">/.test(h));
  assert.ok(/<html[^>]*lang="pt-BR"/.test(h));
  assert.ok(h.includes('js/51-acessibilidade.js'));
  assert.ok(ler('js/05-navigation.js').includes('<main>'), 'o <main> que recebe o foco existe na tela');
});
