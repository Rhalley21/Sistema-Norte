// Um Postgres de verdade (PGlite, dentro do Node) com as MIGRAÇÕES REAIS do projeto carregadas, para testar as regras de
// segurança como elas são: cada pessoa entra com o seu id, com o papel de "usuário logado" (RLS ligado), e o que ela
// consegue ou não fazer é o que o banco decide. O mínimo do Supabase (schema auth, uid(), papéis) é simulado aqui.
const fs = require('fs');
const path = require('path');

const SQL = path.join(__dirname, '..', '..', 'sql');
const BASE = [
  '01',
  '02',
  '03',
  '04',
  '06',
  '07',
  '08',
  '11',
  '12',
  '13',
  '14',
  '15',
  '21',
  '23',
  '24',
  '25',
  '29',
  '36',
  '44',
];

const ID = {
  empresaA: 'aaaaaaaa-0000-4000-8000-000000000001',
  empresaB: 'bbbbbbbb-0000-4000-8000-000000000001',
  ownerA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  rhA: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  liderA: 'aaaaaaaa-0000-4000-8000-0000000000a3',
  colabA: 'aaaaaaaa-0000-4000-8000-0000000000a4',
  desativadoA: 'aaaaaaaa-0000-4000-8000-0000000000a5',
  rh2A: 'aaaaaaaa-0000-4000-8000-0000000000a6',
  ownerB: 'bbbbbbbb-0000-4000-8000-0000000000b1',
  colabB: 'bbbbbbbb-0000-4000-8000-0000000000b2',
  superAdmin: 'ffffffff-0000-4000-8000-0000000000f1',
};

const PAYLOAD_A = {
  empresa: { nome: 'Empresa A' },
  estrutura: [],
  cultura: { missao: 'M' },
  cargos: [{ id: 'c1', nome: 'Vendedor' }],
  colaboradores: [{ id: 'p1', nome: 'Ana', cpf: '123' }],
  bancoAcoes: [],
  ciclos: [{ id: 'k1', nota: null }],
  configuracoes: {},
  feedbackContinuo: [],
  pesquisasClima: [],
  nr1: {},
  rs: { candidatos: [{ id: 'cand1', nome: 'Candidata' }] },
};

async function criarBancoReal({ com45 }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    -- o que o Supabase concede por padrão aos papéis de usuário (sem isso o banco recusa antes mesmo de olhar as regras de linha)
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const arquivos = com45 ? [...BASE, '45'] : BASE;
  for (const prefixo of arquivos) {
    const nome = fs.readdirSync(SQL).find((f) => f.startsWith(`${prefixo}-`));
    await db.exec(fs.readFileSync(path.join(SQL, nome), 'utf8').replace(/create extension[^;]*;/gi, ''));
  }
  // dados de teste (como administrador do banco; o gatilho de cadastro fica de fora)
  await db.exec(`
    set session_replication_role = replica;
    insert into empresas (id, razao_social, nome_fantasia, cnpj) values
      ('${ID.empresaA}', 'Empresa A Ltda', 'Empresa A', '11111111000111'),
      ('${ID.empresaB}', 'Empresa B Ltda', 'Empresa B', '22222222000122');
    insert into auth.users (id, email) values
      ('${ID.ownerA}', 'owner@a.com'), ('${ID.rhA}', 'rh@a.com'), ('${ID.liderA}', 'lider@a.com'), ('${ID.colabA}', 'colab@a.com'),
      ('${ID.desativadoA}', 'desativado@a.com'), ('${ID.rh2A}', 'rh2@a.com'), ('${ID.ownerB}', 'owner@b.com'), ('${ID.colabB}', 'colab@b.com'), ('${ID.superAdmin}', 'super@inetris.com');
    insert into perfis (id, empresa_id, nome, papel, email, desativado) values
      ('${ID.ownerA}', '${ID.empresaA}', 'Dono A', 'owner', 'owner@a.com', false),
      ('${ID.rhA}', '${ID.empresaA}', 'RH A', 'rh', 'rh@a.com', false),
      ('${ID.rh2A}', '${ID.empresaA}', 'RH 2 A', 'rh', 'rh2@a.com', false),
      ('${ID.liderA}', '${ID.empresaA}', 'Líder A', 'lider', 'lider@a.com', false),
      ('${ID.colabA}', '${ID.empresaA}', 'Colab A', 'colaborador', 'colab@a.com', false),
      ('${ID.desativadoA}', '${ID.empresaA}', 'Desativado A', 'colaborador', 'desativado@a.com', true),
      ('${ID.ownerB}', '${ID.empresaB}', 'Dono B', 'owner', 'owner@b.com', false),
      ('${ID.colabB}', '${ID.empresaB}', 'Colab B', 'colaborador', 'colab@b.com', false);
    insert into super_admins (id) values ('${ID.superAdmin}');
    insert into dados_sistema (empresa_id, payload) values
      ('${ID.empresaA}', '${JSON.stringify(PAYLOAD_A)}'::jsonb),
      ('${ID.empresaB}', '{"empresa":{"nome":"Empresa B"},"colaboradores":[{"id":"b1","nome":"Beto"}]}'::jsonb);
    insert into convites (empresa_id, codigo, papel, criado_por) values ('${ID.empresaA}', 'CONVITE-ANTIGO', 'colaborador', '${ID.ownerA}');
    set session_replication_role = origin;
  `);

  // roda UMA instrução como "esta pessoa logada" (ou como visitante sem login); erro vira { ok:false }, sem derrubar o teste
  const como = (uid, papelBanco = 'authenticated') => ({
    async q(sql, params = []) {
      await db.exec('savepoint tentativa');
      try {
        await db.exec(`set local role ${papelBanco}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
        const r = await db.query(sql, params);
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub', '', true)"); // a identidade não vaza para a próxima instrução
        await db.exec('release savepoint tentativa');
        const afetadas = r.affectedRows > 0 ? r.affectedRows : r.rows.length; // consulta: linhas devolvidas; alteração: linhas alteradas
        // permitiu = a instrução funcionou E mexeu em pelo menos uma linha; negou = deu erro OU a segurança por linha filtrou tudo
        return { ok: true, rows: r.rows, afetadas, permitiu: afetadas > 0, negou: afetadas === 0 };
      } catch (e) {
        await db.exec('rollback to savepoint tentativa');
        await db.exec('release savepoint tentativa');
        return {
          ok: false,
          erro: String(e.message),
          code: e.code,
          rows: [],
          afetadas: 0,
          permitiu: false,
          negou: true,
        };
      }
    },
  });
  // cada teste roda dentro de uma transação que é desfeita no fim
  const dentro = async (fn) => {
    await db.exec('begin');
    try {
      return await fn();
    } finally {
      await db.exec('rollback');
    }
  };
  const ver = async (sql, params = []) => (await db.query(sql, params)).rows; // como administrador do banco
  return { db, como, dentro, ver, ID };
}

module.exports = { criarBancoReal, ID, PAYLOAD_A };
