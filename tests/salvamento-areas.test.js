// =========================================================================
// Gravação por ÁREA pela função do banco (js/18-persistence.js + sql/45): o navegador envia SÓ as áreas que a pessoa mudou
// e que o papel dela pode gravar; o banco confere de novo. Aqui o banco é simulado com as MESMAS regras do SQL (a matriz de
// papéis é lida do próprio arquivo sql/45, e um teste confere que a matriz do navegador é idêntica).
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

// ---------- a matriz de papéis do SQL ----------
function matrizDoSql() {
  const sql = ler('sql/45-seguranca-papeis.sql');
  const bloco = /v_permitidas := case v_papel([\s\S]*?)end;/.exec(sql)[1];
  const matriz = {};
  for (const m of bloco.matchAll(/when '(\w+)' then array\[([^\]]*)\]/g))
    matriz[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  matriz.colaborador = [.../else array\[([^\]]*)\]/.exec(bloco)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  return matriz;
}
const MATRIZ = matrizDoSql();

// ---------- o servidor simulado (mesmas regras do SQL) ----------
function payloadInicial() {
  return {
    empresa: { nome: 'Loja X' },
    estrutura: [],
    cultura: {
      missao: 'M',
      indicadoresT: [],
      indicadoresE: [],
      indicadoresPadraoRemovidosT: true,
      indicadoresPadraoRemovidosE: true,
    },
    cargos: [{ id: 'g1', nome: 'Vendedor' }],
    colaboradores: [{ id: 'c1', nome: 'Ana' }],
    bancoAcoes: [],
    ciclos: [{ id: 'k1', nota: null }],
    configuracoes: {},
    feedbackContinuo: [],
    pesquisasClima: [],
    nr1: {},
    rs: {
      requisicoes: [],
      candidatos: [
        { id: 'a', etapa: 'nova', historico: [] },
        { id: 'b', etapa: 'nova', historico: [] },
      ],
    },
  };
}
const copia = (x) => JSON.parse(JSON.stringify(x));
function criarServidor({ comRpc = true, comLinha = true } = {}) {
  const s = {
    linha: comLinha ? { payload: payloadInicial(), versao: 1 } : null,
    chamadas: [],
    comRpc,
    falharRpc: null,
    rejeitarAlem: [],
    falharDireto: null,
  };
  const rpc = (papel) => async (nome, args) => {
    s.chamadas.push({ op: 'rpc', nome, papel, areas: Object.keys(args.p_areas || {}), versao: args.p_versao });
    if (s.falharRpc) {
      const e = s.falharRpc;
      s.falharRpc = null;
      return { data: null, error: e };
    }
    if (!s.comRpc)
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.salvar_dados_areas(p_areas, p_versao) in the schema cache',
        },
      };
    if (!papel) return { data: null, error: { code: '42501', message: 'sem_acesso' } };
    const permitidas = MATRIZ[papel].filter((a) => !s.rejeitarAlem.includes(a));
    const rejeitadas = Object.keys(args.p_areas).filter((k) => !permitidas.includes(k));
    const gravar = Object.fromEntries(Object.entries(args.p_areas).filter(([k]) => permitidas.includes(k)));
    if (!Object.keys(gravar).length)
      return { data: { conflito: false, versao: args.p_versao, rejeitadas }, error: null };
    if (!args.p_versao) {
      if (!['owner', 'rh'].includes(papel)) return { data: null, error: { code: '42501', message: 'sem_acesso' } };
      if (s.linha) return { data: { conflito: true, rejeitadas }, error: null };
      s.linha = { payload: copia(gravar), versao: 1 };
      return { data: { conflito: false, versao: 1, rejeitadas }, error: null };
    }
    if (!s.linha || s.linha.versao !== args.p_versao) return { data: { conflito: true, rejeitadas }, error: null };
    s.linha.payload = { ...s.linha.payload, ...copia(gravar) }; // payload || áreas
    s.linha.versao += 1;
    return { data: { conflito: false, versao: s.linha.versao, rejeitadas }, error: null };
  };
  const from = () => {
    const q = { op: 'select', filtros: {}, cols: '', valores: null };
    const exec = async () => {
      s.chamadas.push({ op: q.op, filtros: { ...q.filtros }, cols: q.cols });
      if (q.op !== 'select' && s.falharDireto) return { data: null, error: s.falharDireto };
      if (q.op === 'select')
        return {
          data: s.linha
            ? /versao/.test(q.cols)
              ? { payload: copia(s.linha.payload), versao: s.linha.versao }
              : { payload: copia(s.linha.payload) }
            : null,
          error: null,
        };
      if (q.op === 'insert') {
        if (s.linha) return { data: null, error: { code: '23505', message: 'duplicate' } };
        s.linha = { payload: copia(q.valores.payload), versao: 1 };
        return { data: [{ versao: 1 }], error: null };
      }
      if (q.op === 'update') {
        if (!s.linha || s.linha.versao !== q.filtros.versao) return { data: [], error: null };
        s.linha.payload = copia(q.valores.payload);
        s.linha.versao += 1;
        return { data: [{ versao: s.linha.versao }], error: null };
      }
    };
    const b = {
      select(c) {
        q.cols = c;
        return b;
      },
      eq(c, v) {
        q.filtros[c] = v;
        return b;
      },
      maybeSingle() {
        return exec();
      },
      insert(v) {
        q.op = 'insert';
        q.valores = v;
        return b;
      },
      update(v) {
        q.op = 'update';
        q.valores = v;
        return b;
      },
      then(res, rej) {
        return exec().then(res, rej);
      },
    };
    return b;
  };
  s.para = (papel) => ({ from, rpc: rpc(papel) });
  s.rpcs = () => s.chamadas.filter((x) => x.op === 'rpc');
  s.diretas = () => s.chamadas.filter((x) => x.op === 'update' || x.op === 'insert');
  return s;
}
const outraPessoaGrava = (s, mudar) => {
  mudar(s.linha.payload);
  s.linha.versao += 1;
};

// ---------- um navegador ----------
function criarCliente(servidor, papel) {
  const c = carregarArquivos(['js/53-merge-estado.js', 'js/18-persistence.js']);
  Object.assign(c, {
    sb: servidor.para(papel),
    empresaIdAtual: 'e1',
    meuPapelReal: papel,
    __toasts: [],
    __auditoria: [],
    __timers: [],
    __console: [],
  });
  c.state = {
    empresa: null,
    estrutura: [],
    cultura: { missao: '', indicadoresT: [], indicadoresE: [] },
    cargos: [],
    colaboradores: [],
    bancoAcoes: [],
    ciclos: [],
    configuracoes: {},
    feedbackContinuo: [],
    pesquisasClima: [],
    nr1: {},
    rs: { requisicoes: [], candidatos: [] },
  };
  c.setTimeout = (fn, ms) => (c.__timers.push({ fn, ms }), c.__timers.length);
  c.clearTimeout = () => {};
  c.showToast = (t) => c.__toasts.push(t);
  c.renderBotaoAtualizar = () => {};
  c.registrarAuditoria = (e, d) => c.__auditoria.push([e, d]);
  c.console = {
    log() {},
    warn: (...a) => c.__console.push(['warn', ...a]),
    error: (...a) => c.__console.push(['error', ...a]),
  };
  return c;
}
const rodar = (c, codigo) => vm.runInContext(codigo, c);
const rodarAsync = (c, codigo) => vm.runInContext(`(async () => { ${codigo} })()`, c);
async function cliente(servidor, papel) {
  const c = criarCliente(servidor, papel);
  await rodarAsync(c, 'await carregarEstado();');
  return c;
}

// ======================= a matriz =======================
test('MATRIZ: as áreas que cada papel grava no NAVEGADOR são exatamente as do SQL 45 (os dois lados não podem divergir)', () => {
  const c = criarCliente(criarServidor(), 'owner');
  const doNavegador = plano(rodar(c, 'AREAS_GRAVAVEIS_POR_PAPEL'));
  assert.deepEqual(Object.keys(MATRIZ).sort(), ['colaborador', 'lider', 'owner', 'rh']);
  for (const papel of Object.keys(MATRIZ))
    assert.deepEqual([...doNavegador[papel]].sort(), [...MATRIZ[papel]].sort(), papel);
  assert.deepEqual(
    plano(rodar(c, 'PERSIST_KEYS')).sort(),
    [...MATRIZ.owner].sort(),
    'o Administrador grava as 12 áreas do documento'
  );
});

test('papel desconhecido ou ausente: não grava NADA (falha segura)', async () => {
  for (const papel of [undefined, null, 'visitante', '']) {
    const s = criarServidor();
    const c = await cliente(s, papel);
    rodar(c, "state.rs.candidatos[0].etapa = 'x'; state.ciclos[0].nota = 1;");
    assert.deepEqual(plano(rodar(c, 'areasGravaveisDoPapel()')), []);
    await rodarAsync(c, 'await salvarEstado();');
    assert.equal(s.rpcs().length + s.diretas().length, 0, String(papel));
    assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
  }
});

// ======================= gravar só o que mudou =======================
test('o navegador envia SÓ as áreas alteradas (e a versão carregada); as outras áreas do servidor ficam intactas', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.deepEqual(
    s.rpcs().map((x) => [x.areas, x.versao]),
    [[['rs'], 1]]
  );
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(s.linha.payload.colaboradores[0].nome, 'Ana');
  assert.equal(s.linha.versao, 2);
  assert.equal(s.diretas().length, 0, 'nada de gravação direta na tabela');
  assert.equal(rodar(c, '_versaoCarregada'), 2);
});

test('nada alterado: nenhuma chamada ao banco; alterar de novo depois de salvar manda só a nova área (a base é atualizada por área)', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'rh');
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 0);
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(c, 'await salvarEstado();');
  rodar(c, "state.colaboradores[0].nome = 'Ana Maria'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.deepEqual(
    s.rpcs().map((x) => [x.areas, x.versao]),
    [
      [['rs'], 1],
      [['colaboradores'], 2],
    ]
  );
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
});

test('áreas que o papel NÃO pode gravar nunca são enviadas, nunca contam como "não salvas" e nunca travam o salvamento das áreas permitidas', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'colaborador');
  rodar(
    c,
    "state.empresa = { nome: 'Trocada' }; state.cargos = []; state.rs.candidatos = []; state.ciclos[0].nota = 7;"
  );
  assert.deepEqual(plano(rodar(c, 'areasAlteradasNoEstado()')), ['ciclos']);
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), true);
  await rodarAsync(c, 'await salvarEstado();');
  assert.deepEqual(
    s.rpcs().map((x) => x.areas),
    [['ciclos']]
  );
  assert.equal(s.linha.payload.ciclos[0].nota, 7);
  assert.equal(s.linha.payload.empresa.nome, 'Loja X');
  assert.equal(s.linha.payload.rs.candidatos.length, 2, 'os candidatos NÃO foram apagados');
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false, 'o que o papel não grava não fica "pendente" para sempre');
});

test('SOMENTE áreas proibidas alteradas (ex.: padrões gerados na carga): não há gravação nenhuma', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'lider');
  rodar(c, "state.cultura = { ...state.cultura, algo: 1 }; state.configuracoes.identidadeVisual = 'x';");
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 0);
  assert.equal(s.linha.versao, 1);
});

// ======================= o banco recusa o que o navegador achava permitido =======================
test('o banco recusa uma área (regra mais restrita que a do navegador): a área volta ao que o servidor tem, a pessoa é avisada, sem repetir sem parar', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'colaborador');
  s.rejeitarAlem = ['ciclos'];
  rodar(c, "state.ciclos[0].nota = 99; state.pesquisasClima.push({ id: 'p1' });");
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 1, 'uma única tentativa, sem laço');
  assert.deepEqual(s.linha.payload.pesquisasClima, [{ id: 'p1' }], 'a área permitida foi gravada');
  assert.equal(rodar(c, 'state.ciclos[0].nota'), null, 'a área recusada voltou ao que o servidor tem');
  assert.ok(c.__toasts.some((t) => t.includes('não foram salvas') && t.includes('ciclos')));
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 1, 'nada pendente: não tenta de novo');
});

// ======================= conflitos e vários papéis =======================
test('O CASO REAL com papéis: o líder salva a avaliação e o RH (tela velha) move um candidato — o RH nunca envia a área "ciclos" e as duas coisas ficam', async () => {
  const s = criarServidor();
  const rh = await cliente(s, 'rh');
  const lider = await cliente(s, 'lider');
  rodar(lider, 'state.ciclos[0].nota = 8');
  await rodarAsync(lider, 'await salvarEstado();');
  rodar(rh, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(rh, 'await salvarEstado();');
  assert.equal(s.linha.payload.ciclos[0].nota, 8);
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.deepEqual(
    s
      .rpcs()
      .filter((x) => x.papel === 'rh')
      .map((x) => x.areas),
    [['rs'], ['rs']],
    'a 1ª tentativa deu conflito; a 2ª, depois de combinar, regrava só a área dele'
  );
  assert.equal(rodar(rh, 'state.ciclos[0].nota'), 8);
  assert.ok(rh.__toasts.some((t) => t.includes('combinadas')));
});

test('conflito de verdade na MESMA área: combina item por item e regrava só as áreas que diferem do servidor', async () => {
  const s = criarServidor();
  const a = await cliente(s, 'rh');
  const b = await cliente(s, 'rh');
  rodar(a, "state.rs.candidatos[0].etapa = 'video'");
  rodar(b, "state.rs.candidatos[1].etapa = 'prova'");
  await rodarAsync(a, 'await salvarEstado();');
  await rodarAsync(b, 'await salvarEstado();');
  assert.deepEqual(
    s.linha.payload.rs.candidatos.map((x) => x.etapa),
    ['video', 'prova']
  );
  assert.deepEqual(b.__auditoria, []);
});

test('o outro grava sem parar (4 tentativas): para com aviso, a alteração continua na tela e marcada como "não salva"', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  const original = s.para('owner').rpc;
  let n = 0;
  c.sb = {
    ...s.para('owner'),
    rpc: async (nome, args) => {
      outraPessoaGrava(s, (p) => (p.empresa = { nome: `v${++n}` }));
      return original(nome, args);
    },
  };
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 4);
  assert.ok(c.__toasts.some((t) => t.includes('Não foi possível salvar agora')));
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), true);
  assert.equal(c.__timers.at(-1).ms, 15000);
});

test('alteração feita DURANTE a gravação não é marcada como salva (vai na próxima)', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  const rpcOriginal = c.sb.rpc;
  c.sb = {
    ...c.sb,
    rpc: async (nome, args) => {
      rodar(c, "state.colaboradores[0].nome = 'Mudei durante'");
      return rpcOriginal(nome, args);
    },
  };
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.linha.payload.colaboradores[0].nome, 'Ana');
  assert.deepEqual(plano(rodar(c, 'areasAlteradasNoEstado()')), ['colaboradores']);
  c.sb = s.para('owner');
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.linha.payload.colaboradores[0].nome, 'Mudei durante');
});

// ======================= falhas e compatibilidade =======================
test('permissão negada pelo banco (conta desativada, acesso que mudou, página antiga): avisa que o acesso não permite e NÃO fica tentando', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  s.falharRpc = { code: '42501', message: 'sem_acesso' };
  await rodarAsync(c, 'await salvarEstado();');
  assert.ok(c.__toasts.some((t) => t.includes('o seu acesso não permite') && t.includes('Ctrl+F5')));
  assert.equal(s.rpcs().length, 1);
  assert.equal(c.__timers.filter((t) => t.ms === 15000).length, 0, 'sem nova tentativa automática');
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), true, 'a alteração continua na tela');
});

test('falha de rede na gravação por função: avisa uma vez, mantém "não salvo", tenta de novo e grava', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  s.falharRpc = { code: '08006', message: 'rede' };
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(c.__toasts.filter((t) => t.includes('Não foi possível salvar agora')).length, 1);
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(rodar(c, 'temAlteracoesNaoSalvas()'), false);
});

test('SITE ANTES DO SQL 45 (o banco ainda não tem a função): grava o documento direto, como antes, descobre isso UMA vez e volta ao modo novo depois de recarregar', async () => {
  const s = criarServidor({ comRpc: false });
  const c = await cliente(s, 'owner');
  rodar(c, "state.rs.candidatos[0].etapa = 'triagem'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 1);
  assert.equal(s.diretas().length, 1);
  assert.equal(s.linha.payload.rs.candidatos[0].etapa, 'triagem');
  assert.equal(rodar(c, '_rpcIndisponivel'), true);
  rodar(c, "state.colaboradores[0].nome = 'Ana Maria'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 1, 'não tenta a função de novo a cada gravação');
  assert.equal(s.diretas().length, 2);
  s.comRpc = true; // o SQL 45 foi aplicado
  await rodarAsync(c, 'await carregarEstado();');
  assert.equal(rodar(c, '_rpcIndisponivel'), false);
  rodar(c, "state.rs.candidatos[1].etapa = 'video'");
  await rodarAsync(c, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 2);
  assert.equal(s.diretas().length, 2, 'voltou ao modo novo');
  assert.equal(s.linha.payload.rs.candidatos[1].etapa, 'video');
});

test('empresa nova (sem documento): o Administrador cria pela função (versão 0); o colaborador não consegue criar', async () => {
  const s = criarServidor({ comLinha: false });
  const dono = await cliente(s, 'owner');
  rodar(dono, "state.empresa = { nome: 'Nova' }; state.cargos = [{ id: 'g' }]");
  await rodarAsync(dono, 'await salvarEstado();');
  assert.equal(s.rpcs().length, 1);
  assert.equal(s.rpcs()[0].versao, 0, 'versão 0: o documento ainda não existe');
  assert.equal(s.rpcs()[0].areas.length, 12, 'numa empresa nova todas as áreas padrão são enviadas (não há base)');
  assert.ok(s.rpcs()[0].areas.includes('empresa') && s.rpcs()[0].areas.includes('cargos'));
  assert.equal(s.linha.versao, 1);
  assert.equal(rodar(dono, '_versaoCarregada'), 1);
  const s2 = criarServidor({ comLinha: false });
  const colab = await cliente(s2, 'colaborador');
  rodar(colab, "state.ciclos = [{ id: 'k' }]");
  await rodarAsync(colab, 'await salvarEstado();');
  assert.equal(s2.linha, null, 'o colaborador não cria o documento da empresa');
  assert.ok(colab.__toasts.some((t) => t.includes('o seu acesso não permite')));
});

test('o modo antigo (sem a coluna "versao") continua sem filtrar por papel e sem usar a função', async () => {
  const s = criarServidor();
  const c = await cliente(s, 'colaborador');
  rodar(c, '_semControleDeVersao = true; state.cargos = [];');
  assert.ok(plano(rodar(c, 'areasAlteradasNoEstado()')).includes('cargos'), 'no modo antigo vale tudo (como antes)');
});

// ======================= contrato com o SQL =======================
test('o navegador só chama a função de gravação em UM lugar e a gravação direta só existe como compatibilidade', () => {
  const js = ler('js/18-persistence.js');
  assert.equal((js.match(/sb\.rpc\('salvar_dados_areas'/g) || []).length, 1);
  assert.ok(js.indexOf('async function gravarComVersao') > 0 && /Caminho antigo/.test(js));
  for (const f of fs.readdirSync(path.join(raiz, 'js')))
    if (f !== '18-persistence.js')
      assert.ok(!/salvar_dados_areas/.test(ler(`js/${f}`)), `js/${f} chama a função de gravação`);
});

test('SQL 45: a função de gravação é "security definer" com caminho de busca fixo, só "authenticated" executa, e a gravação direta na tabela foi fechada', () => {
  const sql = ler('sql/45-seguranca-papeis.sql');
  const fn = /create or replace function salvar_dados_areas[\s\S]*?\$fn\$;/.exec(sql)[0];
  assert.ok(/security definer/.test(fn) && /set search_path = public/.test(fn));
  assert.ok(/revoke all on function salvar_dados_areas\(jsonb, bigint\) from public, anon;/.test(sql));
  assert.ok(/grant execute on function salvar_dados_areas\(jsonb, bigint\) to authenticated;/.test(sql));
  assert.ok(/revoke insert, update, delete on table dados_sistema from anon, authenticated;/.test(sql));
  assert.ok(
    !/create policy [a-z_]+ on dados_sistema for (all|insert|update|delete)/.test(sql),
    'nenhuma política de escrita em dados_sistema'
  );
  for (const funcao of [
    'empresa_do_usuario',
    'meu_papel',
    'perfis_proteger_colunas',
    'empresas_proteger_colunas',
    'salvar_dados_areas',
  ]) {
    const bloco = new RegExp(`function (public\\.)?${funcao}\\([\\s\\S]*?\\$fn\\$;`).exec(sql)[0];
    assert.ok(/set search_path = public/.test(bloco), `${funcao} sem caminho de busca fixo`);
  }
});
