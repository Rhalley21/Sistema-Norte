// =========================================================================
// Banco de dados SIMULADO em memória, no estilo do cliente do Supabase, só com o que as
// Edge Functions usam nos testes: select/insert/update/delete + eq/neq/gt/gte/lt/lte/in/not/is,
// order, limit, single/maybeSingle e contagem (count + head). Deixa testar o COMPORTAMENTO das
// funções (quem recebe, nada duplicado, fronteiras de data) sem um Supabase de verdade.
//
// Uso: const banco = criarBanco({ tabela: [linhas...], __agora: '2026-10-10T11:00:00.000Z' });
//      banco.tabelas.tabela  -> as linhas (mutáveis);  banco.rastro -> lista de operações feitas
// Inserções ganham `id` (uuid) e `criado_em` (= __agora) quando não vêm.
// =========================================================================
const { randomUUID } = require('node:crypto');

const cmp = (a, b) => {
  const na = Date.parse(a);
  const nb = Date.parse(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a < b ? -1 : a > b ? 1 : 0;
};

function criarBanco(tabelas) {
  const rastro = [];
  function from(nome) {
    tabelas[nome] = tabelas[nome] || [];
    const filtros = [];
    let modo = 'select';
    let valores = null;
    let colunas = '*';
    let contar = false;
    let head = false;
    let ordem = null;
    let limite = Infinity;
    let unica = false;
    const q = {
      select(cols = '*', opts) {
        colunas = cols;
        if (opts && opts.count) {
          contar = true;
          head = !!opts.head;
        }
        return q;
      },
      insert(v) {
        modo = 'insert';
        valores = v;
        return q;
      },
      update(v) {
        modo = 'update';
        valores = v;
        return q;
      },
      delete() {
        modo = 'delete';
        return q;
      },
      eq: (c, v) => (filtros.push((r) => r[c] === v), q),
      neq: (c, v) => (filtros.push((r) => r[c] !== v), q),
      gt: (c, v) => (filtros.push((r) => r[c] != null && cmp(r[c], v) > 0), q),
      gte: (c, v) => (filtros.push((r) => r[c] != null && cmp(r[c], v) >= 0), q),
      lt: (c, v) => (filtros.push((r) => r[c] != null && cmp(r[c], v) < 0), q),
      lte: (c, v) => (filtros.push((r) => r[c] != null && cmp(r[c], v) <= 0), q),
      in: (c, vs) => (filtros.push((r) => vs.includes(r[c])), q),
      is: (c, v) => (filtros.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)), q),
      not: (c, op, v) => (
        filtros.push((r) => !(op === 'is' && v === null && (r[c] === null || r[c] === undefined))),
        q
      ),
      order(col, opts = {}) {
        ordem = { col, asc: opts.ascending !== false };
        return q;
      },
      limit(n) {
        limite = n;
        return q;
      },
      single() {
        unica = 'single';
        return q;
      },
      maybeSingle() {
        unica = 'maybe';
        return q;
      },
      then(res, rej) {
        try {
          res(executar());
        } catch (e) {
          rej
            ? rej(e)
            : (() => {
                throw e;
              })();
        }
      },
    };
    // Devolve CÓPIAS das linhas, como um banco de verdade: quem leu não "enxerga" as gravações de quem veio depois.
    // (Sem isso, testes de corrida entre duas requisições enganam: as duas leriam a mesma referência.)
    function projetar(r) {
      if (!String(colunas).includes('payload->')) return structuredClone(r);
      const saida = {};
      for (const tok of colunas.split(',').map((t) => t.trim())) {
        const m = /^(\w+):payload->(\w+)$/.exec(tok);
        if (m) saida[m[1]] = r.payload ? structuredClone(r.payload[m[2]]) : undefined;
        else saida[tok] = structuredClone(r[tok]);
      }
      return saida;
    }
    function resposta(linhas) {
      if (unica) {
        if (linhas.length === 0)
          return unica === 'single'
            ? { data: null, error: { message: 'Nenhuma linha encontrada', code: 'PGRST116' } }
            : { data: null, error: null };
        return { data: linhas[0], error: null };
      }
      return { data: linhas, error: null };
    }
    function executar() {
      const alvo = tabelas[nome];
      if (modo === 'insert') {
        const novos = (Array.isArray(valores) ? valores : [valores]).map((v) => ({
          id: randomUUID(),
          criado_em: tabelas.__agora,
          ...v,
        }));
        novos.forEach((v) => alvo.push(v));
        rastro.push({ tabela: nome, op: 'insert', valores: novos });
        return resposta(novos.map(projetar));
      }
      let casadas = alvo.filter((r) => filtros.every((f) => f(r)));
      if (ordem) casadas = [...casadas].sort((a, b) => (ordem.asc ? 1 : -1) * cmp(a[ordem.col], b[ordem.col]));
      if (modo === 'update') {
        casadas.forEach((r) => Object.assign(r, valores));
        rastro.push({ tabela: nome, op: 'update', valores, linhas: casadas.length });
        return resposta(casadas.map(projetar));
      }
      if (modo === 'delete') {
        tabelas[nome] = alvo.filter((r) => !casadas.includes(r));
        rastro.push({ tabela: nome, op: 'delete', linhas: casadas.length });
        return resposta(casadas.map(projetar));
      }
      const pagina = casadas.slice(0, limite);
      if (contar) return { count: casadas.length, data: head ? null : pagina.map(projetar), error: null };
      return resposta(pagina.map(projetar));
    }
    return q;
  }
  return { from, tabelas, rastro };
}

// Envio de e-mail simulado: guarda o que foi "enviado" e permite fazer falhar por destinatário.
function emailsFalsos(falhar = () => false) {
  const lista = [];
  const enviar = async (para, assunto, corpoHtml) => {
    if (falhar(para)) return false;
    lista.push({ para, assunto, corpoHtml });
    return true;
  };
  return { lista, enviar };
}

module.exports = { criarBanco, emailsFalsos, cmp };
