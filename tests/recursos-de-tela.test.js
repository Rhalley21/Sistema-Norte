// =========================================================================
// Câmeras e leitor de QR precisam ser desligados quando a pessoa sai da tela.
// Bug que existia: abrir a câmera do Ponto e trocar de tela pelo menu deixava a
// câmera ligada em segundo plano. Este teste garante que a liberação central
// existe, é chamada na troca de tela e no logout, e cobre TODA função que pare
// uma câmera (inclusive as que forem criadas no futuro).
// =========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const js = fs.readdirSync(path.join(raiz, 'js')).filter((f) => f.endsWith('.js'));

test('render() libera câmeras e leitor de QR quando a tela muda', () => {
  const nav = ler('js/05-navigation.js');
  assert.ok(
    /if \(mudouDeTela\) liberarRecursosDeTela\(\);/.test(nav),
    'render() precisa chamar liberarRecursosDeTela() ao trocar de tela'
  );
});

test('o logout (tela de login) também libera as câmeras', () => {
  assert.ok(ler('js/35-tela-entrada.js').includes('liberarRecursosDeTela();'));
});

test('liberarRecursosDeTela cobre toda função "parar…Camera/Leitor" do sistema', () => {
  const nav = ler('js/05-navigation.js');
  const corpo = nav.slice(nav.indexOf('function liberarRecursosDeTela'), nav.indexOf('function render()'));
  const paradores = new Set();
  js.forEach((f) => {
    for (const m of ler(`js/${f}`).matchAll(/^function (parar\w*(?:Camera|Leitor)\w*)\(/gm)) paradores.add(m[1]);
  });
  assert.ok(paradores.size >= 3, 'esperava achar as funções de parar câmera/leitor');
  paradores.forEach((nome) =>
    assert.ok(
      corpo.includes(nome),
      `${nome} não está em liberarRecursosDeTela() — a câmera ficaria ligada ao sair da tela`
    )
  );
});

test('todo uso de getUserMedia/Html5Qrcode tem uma função de parar correspondente', () => {
  js.forEach((f) => {
    const src = ler(`js/${f}`);
    if (/getUserMedia|new Html5Qrcode/.test(src)) {
      assert.ok(
        /\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)|\.stop\(\)/.test(src),
        `${f} abre câmera mas não tem como pará-la`
      );
    }
  });
});
