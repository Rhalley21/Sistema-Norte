/* =========================================================
   ACESSIBILIDADE (o que dá para resolver em UM lugar só)
   -----------------------------------------------------------
   O sistema desenha as telas por texto (HTML montado em JavaScript). Em vez de mexer em centenas de trechos, este módulo
   olha a tela depois de cada desenho e completa o que falta para leitores de tela e para quem usa só o teclado:
     - RÓTULOS: liga cada <label> ao seu campo (for/id) e dá nome (placeholder/title) a campo sem rótulo;
     - TECLADO: elemento clicável que não é botão (div, span, item de lista...) vira "botão" focável e responde a Enter e
       Espaço; linhas de tabela clicáveis ganham foco;
     - NOMES: botão só com ícone/emoji usa o título como nome; imagem sem alt vira decorativa; <th> ganha scope;
     - MENU: item atual com aria-current, item bloqueado com aria-disabled, grupo recolhível com aria-expanded;
     - CONTEÚDO: o <main> recebe id e foco (para o link "Pular para o conteúdo").
   Só mexe em ATRIBUTOS (nunca em texto nem na estrutura) e nunca derruba a tela: qualquer erro aqui é engolido.
   Cores, foco visível, movimento reduzido e o link de pular estão em css/style.css e app.html.
   ========================================================= */

let _a11yContador = 0;
let _a11yAgendado = false;

const A11Y_CONTROLES =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';
const A11Y_NATIVOS = 'button, a[href], input, select, textarea, summary, [role], [tabindex]';
const A11Y_SIMBOLOS = { '×': 'Fechar', '✕': 'Fechar', '✖': 'Fechar', '←': 'Voltar', '‹': 'Voltar', '›': 'Avançar' };

// O campo que vem depois do rótulo (no mesmo bloco). Um novo rótulo no caminho encerra a busca.
function a11yProximoControle(rotulo) {
  let el = rotulo.nextElementSibling;
  while (el) {
    if (el.tagName === 'LABEL') return null;
    if (el.matches && el.matches(A11Y_CONTROLES)) return el;
    const dentro = el.querySelector ? el.querySelector(A11Y_CONTROLES) : null;
    if (dentro) return dentro;
    el = el.nextElementSibling;
  }
  return null;
}

function a11yTemRotulo(doc, controle) {
  if (controle.getAttribute('aria-label') || controle.getAttribute('aria-labelledby')) return true;
  if (controle.closest('label')) return true;
  return !!(controle.id && doc.querySelector(`label[for="${controle.id.replace(/"/g, '\\"')}"]`));
}

function a11yRotulos(raiz) {
  const doc = raiz.ownerDocument || raiz;
  raiz.querySelectorAll('label:not([for])').forEach((rotulo) => {
    if (rotulo.querySelector(A11Y_CONTROLES)) return; // rótulo que envolve o próprio campo
    const controle = a11yProximoControle(rotulo);
    if (!controle || a11yTemRotulo(doc, controle)) return;
    if (!controle.id) controle.id = `a11y-campo-${++_a11yContador}`;
    rotulo.setAttribute('for', controle.id);
  });
  // campo SEM rótulo nenhum: o placeholder ou o título servem de nome
  raiz.querySelectorAll(A11Y_CONTROLES).forEach((controle) => {
    if (a11yTemRotulo(doc, controle)) return;
    const nome = controle.getAttribute('placeholder') || controle.getAttribute('title');
    if (nome) controle.setAttribute('aria-label', nome);
  });
}

function a11yTeclado(raiz) {
  raiz.querySelectorAll('[onclick]').forEach((el) => {
    if (el.matches(A11Y_NATIVOS) || el.closest('button, a[href], summary, label')) return;
    if (el.tagName !== 'TR' && el.tagName !== 'TD') el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
  });
}

function a11yNomes(raiz) {
  raiz.querySelectorAll('button, [role="button"]').forEach((b) => {
    if (b.getAttribute('aria-label') || b.getAttribute('aria-labelledby')) return;
    const texto = (b.textContent || '').trim();
    if (/[\p{L}\p{N}]/u.test(texto)) return; // já tem nome em texto
    const nome = b.getAttribute('title') || A11Y_SIMBOLOS[texto];
    if (nome) b.setAttribute('aria-label', nome);
  });
  raiz.querySelectorAll('img:not([alt])').forEach((i) => i.setAttribute('alt', ''));
  raiz.querySelectorAll('th:not([scope])').forEach((th) => th.setAttribute('scope', 'col'));
  raiz.querySelectorAll('nav.steps:not([aria-label])').forEach((n) => n.setAttribute('aria-label', 'Menu principal'));
  raiz.querySelectorAll('.step-btn').forEach((b) => {
    if (b.classList.contains('active')) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
    if (b.classList.contains('locked')) b.setAttribute('aria-disabled', 'true');
  });
  raiz
    .querySelectorAll('.step-group-toggle')
    .forEach((b) => b.setAttribute('aria-expanded', b.querySelector('.step-group-chevron.aberto') ? 'true' : 'false'));
  const principal = raiz.querySelector('main');
  if (principal) {
    if (!principal.id) principal.id = 'conteudo-principal';
    if (!principal.hasAttribute('tabindex')) principal.setAttribute('tabindex', '-1');
  }
}

// Aplica tudo na árvore. Nunca lança erro: acessibilidade não pode derrubar a tela.
function aplicarAcessibilidade(raiz) {
  const r = raiz || document;
  try {
    a11yRotulos(r);
    a11yTeclado(r);
    a11yNomes(r);
  } catch (e) {
    /* segue sem os ajustes */
  }
}

// Enter e Espaço acionam o "botão" que não é um botão de verdade.
function a11yTeclaPressionada(ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target;
  if (!el || !el.matches || !el.matches('[onclick][tabindex]')) return;
  if (el.matches('button, a[href], input, select, textarea, summary')) return;
  ev.preventDefault();
  el.click();
}

function iniciarAcessibilidade() {
  aplicarAcessibilidade(document);
  document.addEventListener('keydown', a11yTeclaPressionada);
  const alvo = document.getElementById('app') || document.body;
  // A cada desenho da tela (uma rajada de mudanças vira UMA passada, no próximo quadro). Só ouve inserção/remoção:
  // os atributos que este módulo grava não disparam nada de novo.
  new MutationObserver(() => {
    if (_a11yAgendado) return;
    _a11yAgendado = true;
    requestAnimationFrame(() => {
      _a11yAgendado = false;
      aplicarAcessibilidade(document);
    });
  }).observe(alvo, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarAcessibilidade);
else iniciarAcessibilidade();
