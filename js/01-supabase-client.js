/* =========================================================
   Conexão com o Supabase (mesmo projeto/tabelas já criados
   nos passos anteriores: empresas, perfis, convites,
   dados_sistema). Chave "anon/publishable" — segura de
   expor no front-end.
   ========================================================= */
const SUPABASE_URL = 'https://mgkmvrgfmuexgxkuslur.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uOz0hehVdqv_7Q2LBzVbzg_J6ZH40fh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sessaoAtual = null;
let empresaIdAtual = null;
let meuPerfilId = null;
let meuPapelReal = null; // owner | rh | lider | colaborador (papel de verdade, do banco)
let meuEscopoEstendido = false; // Escopo estendido: exceção concedida pelo Administrador para um Gestor ver a empresa toda (extensão de RBAC — PRD Cap. 3, sem RN própria)

