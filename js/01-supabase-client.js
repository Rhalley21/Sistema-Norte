/* =========================================================
   Conexão com o Supabase (mesmo projeto/tabelas já criados
   nos passos anteriores: empresas, perfis, convites,
   dados_sistema). Chave "anon/publishable" — segura de
   expor no front-end.
   ========================================================= */
const SUPABASE_URL = 'https://mgkmvrgfmuexgxkuslur.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uOz0hehVdqv_7Q2LBzVbzg_J6ZH40fh';
// BUG CORRIGIDO (disputa de "quem chega primeiro"): por padrão, o próprio
// supabase-js já tenta detectar e processar sozinho qualquer token de sessão
// presente na URL (detectSessionInUrl: true), ao mesmo tempo em que nosso
// código (js/19-auth.js) também tenta fazer a mesma coisa explicitamente.
// Duas rotinas competindo pra processar o mesmo link é exatamente o tipo de
// corrida que fazia o link de recuperação às vezes funcionar, às vezes não
// — dependendo de qual das duas "ganhava" primeiro. Desligando a detecção
// automática, só o nosso código decide o que fazer com o link.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: false },
});

let sessaoAtual = null;
let empresaIdAtual = null;
let meuPerfilId = null;
let meuPapelReal = null; // owner | rh | lider | colaborador (papel de verdade, do banco)
let meuEscopoEstendido = false; // Escopo estendido: exceção concedida pelo Administrador para um Gestor ver a empresa toda (extensão de RBAC — PRD Cap. 3, sem RN própria)
let souSuperAdmin = false; // Super Admin da plataforma (dono do NORTE) — nível acima do papel dentro da Empresa. Ver sql/11-licenciamento-empresas.sql
