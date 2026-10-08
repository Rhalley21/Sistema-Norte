// =========================================================================
// NORTE — Edge Function "login-bloqueio"
// =========================================================================
// Pública (sem login, já que roda ANTES do login acontecer de verdade) — move o
// bloqueio de "5 tentativas erradas" do localStorage (só no navegador de quem
// tentou, fácil de contornar limpando o navegador) pra uma tabela real no banco,
// reaproveitando o rate_limit_log dos outros limites de taxa do sistema.
//
// POR QUE A CHAVE É "e-mail + IP" (corrigido na v0.105.0): a primeira versão
// contava falhas só por e-mail — e como qualquer um pode chamar "registrar_falha"
// sem provar que errou a senha, QUALQUER PESSOA conseguia travar a conta de
// outra por 15 minutos, repetidamente (negação de serviço dirigida). Agora o
// bloqueio vale pro par e-mail + IP: o atacante só bloqueia a si mesmo; o dono da
// conta, de outro IP, continua entrando. Além disso, cada IP tem um teto de falhas
// (em qualquer e-mail), o que barra tentativa de adivinhar senha em série.
//
// Limitação honesta: isto vale pra quem usa a TELA de login. Quem chamasse a API
// de autenticação do Supabase direto, por fora do nosso site, não passa por aqui —
// pra fechar essa brecha de vez, seria preciso um "Auth Hook" no painel do Supabase.
// =========================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const MAX_TENTATIVAS = 5; // falhas por e-mail+IP na janela
const MAX_FALHAS_POR_IP = 30; // falhas por IP (em qualquer e-mail) na janela
const JANELA_MINUTOS = 15;

function ipDoRequisitante(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'desconhecido';
}
function chavePara(email: string, ip: string): string {
  return `login:${String(email || '').trim().toLowerCase()}|${ip}`;
}
function chaveIp(ip: string): string {
  return `loginip:${ip}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action;
    const email = String(body.email || '').trim().slice(0, 254);
    if (!email) return jsonResponse({ error: 'E-mail é obrigatório.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ip = ipDoRequisitante(req);
    const chave = chavePara(email, ip);
    const desde = () => new Date(Date.now() - JANELA_MINUTOS * 60000).toISOString();
    const contar = async (k: string) => {
      const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', k).eq('acao', 'login_falho').gte('criado_em', desde());
      return count || 0;
    };
    // Sem IP identificável, não dá pra separar quem é quem: não bloqueia no servidor
    // (o bloqueio local do navegador continua valendo) — melhor que travar todo mundo junto.
    const semIp = ip === 'desconhecido';

    if (action === 'checar') {
      if (semIp) return jsonResponse({ bloqueado: false, minutosRestantes: 0 });
      const bloqueado = (await contar(chave)) >= MAX_TENTATIVAS || (await contar(chaveIp(ip))) >= MAX_FALHAS_POR_IP;
      return jsonResponse({ bloqueado, minutosRestantes: bloqueado ? JANELA_MINUTOS : 0 });
    }

    if (action === 'registrar_falha') {
      if (semIp) return jsonResponse({ ok: true });
      // IP que já passou do teto não enche mais a tabela (já está bloqueado).
      if ((await contar(chaveIp(ip))) >= MAX_FALHAS_POR_IP) return jsonResponse({ ok: true, limitado: true });
      await admin.from('rate_limit_log').insert([
        { chave, acao: 'login_falho' },
        { chave: chaveIp(ip), acao: 'login_falho' },
      ]);
      return jsonResponse({ ok: true });
    }

    if (action === 'limpar') {
      // Login deu certo — limpa o histórico de falhas desse e-mail NESTE IP (o total do
      // IP fica: é ele que freia quem chuta senhas de várias contas).
      if (!semIp) await admin.from('rate_limit_log').delete().eq('chave', chave).eq('acao', 'login_falho');
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função login-bloqueio:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// Supabase > Edge Functions > login-bloqueio > cole este código > Deploy.
// ATENÇÃO — "Verify JWT": esta função é chamada ANTES do login, só com a chave
// pública do projeto. Se o seu projeto usa as chaves novas (sb_publishable_...),
// que não são JWT, deixe "Verify JWT" DESLIGADO nesta função — senão toda chamada
// volta 401 e o bloqueio no servidor nunca funciona (o site cai no bloqueio local,
// em silêncio). A função se protege sozinha: só conta tentativas por e-mail+IP.
// =========================================================================
