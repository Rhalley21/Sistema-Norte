#!/usr/bin/env node
// =========================================================================
// Migrações do banco (SQL) — o que falta rodar?
// -------------------------------------------------------------------------
// Cada arquivo da pasta sql/ a partir do 15 (o 15 cria a tabela de controle) se REGISTRA no fim, na tabela
// "migrations_aplicadas". Os arquivos 01 a 14 são do começo do projeto e não se registram. Este script:
//   1) lê os arquivos da pasta sql/ que se registram sozinhos (os "gerenciados");
//   2) pergunta ao banco quais já estão registrados;
//   3) lista os PENDENTES, na ordem numérica.
//
// Por padrão só SIMULA (lista o que falta). Para aplicar de verdade precisa de TRÊS coisas ao mesmo tempo:
//   - EXECUTAR=true (a caixinha "executar" do fluxo manual);
//   - o ambiente escolhido ter projeto configurado;
//   - se for PRODUÇÃO: a variável do GitHub MIGRACOES_AUTOMATICAS_PRODUCAO = true (liberação deliberada).
// Aplica um arquivo por vez, na ordem; PARA no primeiro erro; confere se o arquivo se registrou. Nunca imprime o
// token nem o conteúdo do SQL.
//
// Usa a API de gerenciamento do Supabase (POST /v1/projects/{ref}/database/query) com o SUPABASE_ACCESS_TOKEN.
// ATENÇÃO: o formato dessa API não foi verificado contra o Supabase de verdade no ambiente de desenvolvimento
// (por isso a primeira execução deve ser SIMULAÇÃO).
// =========================================================================
const fs = require('fs');
const path = require('path');

const PROJETO_PRODUCAO_PADRAO = 'mgkmvrgfmuexgxkuslur';

function numeroDoArquivo(nome) {
  const m = /^(\d+)-.+\.sql$/.exec(nome);
  return m ? Number(m[1]) : null;
}

// Arquivos que o sistema controla: os que se registram em migrations_aplicadas com o PRÓPRIO nome.
function arquivosGerenciados(dir) {
  return fs
    .readdirSync(dir)
    .filter((n) => numeroDoArquivo(n) !== null)
    .sort((a, b) => numeroDoArquivo(a) - numeroDoArquivo(b))
    .filter((n) => {
      const texto = fs.readFileSync(path.join(dir, n), 'utf8');
      return texto.includes('migrations_aplicadas') && texto.includes(n);
    })
    .map((n) => ({ nome: n, caminho: path.join(dir, n) }));
}

function pendentes(gerenciados, aplicados) {
  const feitos = new Set(aplicados);
  return gerenciados.filter((g) => !feitos.has(g.nome));
}

// Qual projeto do Supabase usar neste ambiente.
function escolherProjeto(ambiente, env) {
  if (ambiente === 'teste') {
    const ref = (env.PROJETO_TESTE || '').trim();
    return ref
      ? { ref }
      : {
          erro: 'O ambiente de testes ainda não tem projeto: crie a variável PROJETO_TESTE no GitHub (veja docs/AMBIENTES.md).',
        };
  }
  return { ref: (env.PROJETO_PRODUCAO || '').trim() || PROJETO_PRODUCAO_PADRAO };
}

async function consulta(api, ref, token, sql) {
  const r = await api(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${String(corpo).slice(0, 400)}`);
  return corpo ? JSON.parse(corpo) : [];
}

async function arquivosAplicados(api, ref, token) {
  const linhas = await consulta(api, ref, token, 'select arquivo from migrations_aplicadas order by arquivo;');
  return linhas.map((l) => l.arquivo);
}

// Roda tudo. Devolve { codigo, pendentes:[nomes], aplicados:[nomes], mensagem } — o "codigo" é o código de saída do processo.
async function executar({ dir, api, env, ambiente, executar: aplicarDeVerdade, log }) {
  const diz = log || (() => {});
  const token = (env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!token)
    return {
      codigo: 1,
      pendentes: [],
      aplicados: [],
      mensagem: 'Falta o secret SUPABASE_ACCESS_TOKEN (veja docs/CI-E-IMPLANTACAO.md).',
    };
  const projeto = escolherProjeto(ambiente, env);
  if (projeto.erro) return { codigo: 1, pendentes: [], aplicados: [], mensagem: projeto.erro };
  if (aplicarDeVerdade && ambiente !== 'teste' && String(env.LIBERA_PRODUCAO || '').trim() !== 'true') {
    return {
      codigo: 1,
      pendentes: [],
      aplicados: [],
      mensagem:
        'Bloqueado: aplicar SQL em PRODUÇÃO exige a variável MIGRACOES_AUTOMATICAS_PRODUCAO = true no GitHub (libere só depois do Supabase Pro e de testar no ambiente de testes). Rode como simulação para ver o que falta.',
    };
  }
  const gerenciados = arquivosGerenciados(dir);
  let feitos;
  try {
    feitos = await arquivosAplicados(api, projeto.ref, token);
  } catch (e) {
    // Banco novo (ex.: o de testes): a tabela de controle nasce no arquivo 15 — antes dele, "nada aplicado ainda".
    if (/migrations_aplicadas[^]*does not exist|42P01/i.test(e.message)) {
      diz(
        'A tabela de controle (migrations_aplicadas) ainda não existe: banco novo. Ela é criada pelo arquivo 15; os arquivos 01 a 14 precisam ter sido rodados à mão antes.'
      );
      feitos = [];
    } else {
      return {
        codigo: 1,
        pendentes: [],
        aplicados: [],
        mensagem: `Não consegui ler a tabela de controle (migrations_aplicadas): ${e.message}`,
      };
    }
  }
  const faltam = pendentes(gerenciados, feitos);
  const nomesFaltam = faltam.map((f) => f.nome);
  diz(
    `Ambiente: ${ambiente}. Arquivos controlados: ${gerenciados.length}. Já registrados no banco: ${feitos.length}. Pendentes: ${faltam.length}.`
  );
  if (!faltam.length)
    return { codigo: 0, pendentes: [], aplicados: [], mensagem: 'Nada pendente: o banco está em dia.' };
  nomesFaltam.forEach((n) => diz(`  pendente: ${n}`));
  if (!aplicarDeVerdade)
    return {
      codigo: 0,
      pendentes: nomesFaltam,
      aplicados: [],
      mensagem:
        'SIMULAÇÃO: nada foi aplicado. Rode de novo marcando "executar" para aplicar (em produção, só com a liberação do GitHub).',
    };

  const aplicados = [];
  for (const arq of faltam) {
    diz(`Aplicando ${arq.nome}…`);
    try {
      await consulta(api, projeto.ref, token, fs.readFileSync(arq.caminho, 'utf8'));
    } catch (e) {
      return {
        codigo: 1,
        pendentes: nomesFaltam.filter((n) => !aplicados.includes(n)),
        aplicados,
        mensagem: `ERRO em ${arq.nome} (os arquivos seguintes NÃO foram aplicados): ${e.message}`,
      };
    }
    let registrado = false;
    try {
      registrado =
        (
          await consulta(
            api,
            projeto.ref,
            token,
            `select 1 as ok from migrations_aplicadas where arquivo = $$${arq.nome}$$;`
          )
        ).length > 0;
    } catch (e) {
      registrado = false;
    }
    if (!registrado)
      return {
        codigo: 1,
        pendentes: nomesFaltam.filter((n) => !aplicados.includes(n)),
        aplicados,
        mensagem: `${arq.nome} rodou, mas NÃO se registrou em migrations_aplicadas — parei por segurança. Confira o arquivo no banco.`,
      };
    aplicados.push(arq.nome);
    diz(`  ok: ${arq.nome}`);
  }
  return { codigo: 0, pendentes: [], aplicados, mensagem: `Aplicados ${aplicados.length} arquivo(s).` };
}

function resumoMarkdown(r, ambiente, aplicouDeVerdade) {
  const linhas = [`### Migrações do banco — ambiente: ${ambiente}`, ''];
  linhas.push(r.codigo === 0 ? `**${r.mensagem}**` : `**FALHOU:** ${r.mensagem}`, '');
  if (r.pendentes.length) linhas.push('Pendentes:', ...r.pendentes.map((n) => `- ${n}`), '');
  if (r.aplicados.length) linhas.push('Aplicados agora:', ...r.aplicados.map((n) => `- ${n}`), '');
  if (!aplicouDeVerdade && r.pendentes.length) linhas.push('_Era uma simulação._', '');
  return linhas.join('\n');
}

async function principal() {
  const ambiente = (process.env.AMBIENTE || 'producao').trim() === 'teste' ? 'teste' : 'producao';
  const aplicarDeVerdade = String(process.env.EXECUTAR || '').trim() === 'true';
  const r = await executar({
    dir: path.join(__dirname, '..', 'sql'),
    api: fetch,
    env: process.env,
    ambiente,
    executar: aplicarDeVerdade,
    log: (t) => console.log(t),
  });
  console.log(r.codigo === 0 ? r.mensagem : `::error::${r.mensagem}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumoMarkdown(r, ambiente, aplicarDeVerdade) + '\n');
  process.exit(r.codigo);
}

module.exports = {
  numeroDoArquivo,
  arquivosGerenciados,
  pendentes,
  escolherProjeto,
  consulta,
  arquivosAplicados,
  executar,
  resumoMarkdown,
  PROJETO_PRODUCAO_PADRAO,
};
if (require.main === module) principal();
