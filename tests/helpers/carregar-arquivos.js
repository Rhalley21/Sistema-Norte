// =========================================================================
// Carrega arquivo(s) JS reais do sistema (js/*.js) numa "caixa de areia"
// do Node, com um "document"/"window"/"state" mínimos simulados — só o
// suficiente pra rodar sem erro. Isso deixa testar as funções de CÁLCULO
// de verdade (a mesma função que roda no navegador), sem reescrever a
// lógica numa cópia separada que pode divergir do código real com o tempo.
//
// Uso:
//   const ctx = carregarArquivos(['js/02-core-helpers.js']);
//   ctx.classificar(0.9) // -> 'A'
// =========================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function criarContextoBase(stateInicial = {}) {
  const contexto = {
    console,
    state: stateInicial,
    // DOM mínimo — só o bastante pra funções que fazem getElementById não
    // quebrar caso sejam carregadas (mesmo que o teste não use essa parte).
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {} }),
    },
    window: {},
    location: { origin: '', pathname: '/' },
    // Muitas funções recebem "sb" (cliente Supabase) só de passagem — um
    // stub que nunca é chamado nos testes de cálculo puro basta.
    sb: { from: () => ({ select: () => ({ eq: () => ({}) }) }), functions: { invoke: async () => ({}) } },
  };
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  return contexto;
}

function carregarArquivos(caminhos, stateInicial = {}) {
  const contexto = criarContextoBase(stateInicial);
  const raiz = path.join(__dirname, '..', '..');
  for (const rel of caminhos) {
    const codigo = fs.readFileSync(path.join(raiz, rel), 'utf8');
    vm.runInContext(codigo, contexto, { filename: rel });
  }
  return contexto;
}

module.exports = { carregarArquivos, criarContextoBase };
