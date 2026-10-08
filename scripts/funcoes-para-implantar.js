#!/usr/bin/env node
// =========================================================================
// Descobre QUAIS Edge Functions precisam ser implantadas — e com qual
// configuração de "Verify JWT" — pra a implantação automática (GitHub Actions)
// mexer só no que mudou.
//
// Uso:
//   node scripts/funcoes-para-implantar.js --todas
//   node scripts/funcoes-para-implantar.js --pedido "rs, ponto"        (nomes, ou "todas")
//   node scripts/funcoes-para-implantar.js --base <sha-antigo> --head <sha-novo>
//
// Saída (JSON): [{ "nome": "rs", "verifyJwt": false }, ...]
// Qualquer dúvida (não deu pra comparar os commits, nome desconhecido...) cai no
// lado SEGURO: ou implanta tudo, ou recusa — nunca implanta "no escuro".
// =========================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

function listarFuncoes(raiz = RAIZ) {
  const pasta = path.join(raiz, 'supabase', 'functions');
  if (!fs.existsSync(pasta)) return [];
  return fs
    .readdirSync(pasta, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(pasta, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort();
}

// Lê só o que importa do supabase/config.toml: [functions.NOME] + verify_jwt = true|false.
function lerConfiguracao(raiz = RAIZ) {
  const arquivo = path.join(raiz, 'supabase', 'config.toml');
  const config = {};
  if (!fs.existsSync(arquivo)) return config;
  let atual = null;
  for (const bruta of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const linha = bruta.replace(/#.*$/, '').trim();
    if (!linha) continue;
    const secao = /^\[functions\.([A-Za-z0-9_-]+)\]$/.exec(linha);
    if (secao) {
      atual = secao[1];
      config[atual] = config[atual] || {};
      continue;
    }
    if (linha.startsWith('[')) {
      atual = null;
      continue;
    }
    const jwt = /^verify_jwt\s*=\s*(true|false)$/.exec(linha);
    if (jwt && atual) config[atual].verifyJwt = jwt[1] === 'true';
  }
  return config;
}

// Dos arquivos alterados, quais funções foram tocadas. Mexeu na configuração = reimplanta tudo.
function funcoesAfetadas(arquivosAlterados, todas) {
  const afetadas = new Set();
  for (const arquivo of arquivosAlterados) {
    const caminho = String(arquivo).replace(/\\/g, '/').trim();
    if (caminho === 'supabase/config.toml') return [...todas].sort();
    const m = /^supabase\/functions\/([^/]+)\//.exec(caminho);
    if (m && todas.includes(m[1])) afetadas.add(m[1]);
  }
  return [...afetadas].sort();
}

// "todas" ou "rs, ponto": só aceita nomes que existem de verdade (nunca texto livre num comando).
function interpretarPedido(texto, todas) {
  const t = String(texto || '').trim();
  if (!t || t.toLowerCase() === 'todas') return [...todas].sort();
  const nomes = t
    .split(/[,\s]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const desconhecidos = nomes.filter((n) => !todas.includes(n));
  if (desconhecidos.length)
    throw new Error(`Função(ões) inexistente(s): ${desconhecidos.join(', ')}. Existem: ${todas.join(', ')}`);
  return [...new Set(nomes)].sort();
}

function comConfiguracao(nomes, config) {
  // Sem entrada no config.toml = "Verify JWT" ligado (o padrão do Supabase).
  return nomes.map((nome) => ({ nome, verifyJwt: config[nome]?.verifyJwt !== false }));
}

function arquivosAlteradosEntre(base, head, raiz = RAIZ) {
  if (!base || /^0+$/.test(base)) return null; // primeiro push (ou sem base): não dá pra comparar
  try {
    const saida = execFileSync('git', ['diff', '--name-only', base, head || 'HEAD'], { cwd: raiz, encoding: 'utf8' });
    return saida.split('\n').filter(Boolean);
  } catch (e) {
    return null; // clone raso ou commit inexistente
  }
}

function principal(argv) {
  const arg = (nome) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const todas = listarFuncoes();
  const config = lerConfiguracao();
  let nomes;
  if (argv.includes('--todas')) nomes = todas;
  else if (arg('--pedido') !== undefined) nomes = interpretarPedido(arg('--pedido'), todas);
  else {
    const alterados = arquivosAlteradosEntre(arg('--base'), arg('--head'));
    if (alterados === null) {
      console.error('Aviso: não consegui comparar os commits — implantando TODAS as funções, por segurança.');
      nomes = todas;
    } else nomes = funcoesAfetadas(alterados, todas);
  }
  process.stdout.write(JSON.stringify(comConfiguracao(nomes, config)) + '\n');
}

if (require.main === module) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = {
  listarFuncoes,
  lerConfiguracao,
  funcoesAfetadas,
  interpretarPedido,
  comConfiguracao,
  arquivosAlteradosEntre,
};
