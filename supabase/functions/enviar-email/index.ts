// =========================================================================
// NORTE — Edge Function "enviar-email"
// =========================================================================
// O que faz: recebe um pedido (destinatário, assunto, corpo em HTML) e manda
// pra API do Resend — mantendo a chave da API do Resend só aqui no servidor.
//
// SEGURANÇA (corrigida na v0.105.0): antes, esta função mandava QUALQUER e-mail
// pra QUALQUER pessoa, com o remetente que o chamador quisesse, sem login e sem
// limite — um canal aberto pra spam e phishing com a cara do @inetris.com.br.
// Agora:
//   - só aceita (a) outra Edge Function nossa (chave de serviço) ou (b) um
//     usuário LOGADO de uma empresa; chamada anônima é recusada;
//   - o remetente é sempre o padrão (não dá mais pra escolher);
//   - destinatário precisa ser UM e-mail válido; assunto e corpo têm tamanho máximo;
//   - usuários têm limite por hora e empresas por dia (empresa em teste grátis
//     tem limite bem menor — é o caminho natural de abuso).
//
// Como implantar: veja as instruções no final deste arquivo.
// =========================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// Domínio inetris.com.br verificado no Resend (30/09/2026).
const REMETENTE_PADRAO = 'INETRIS <notificacoes@inetris.com.br>';

const LIMITE_USUARIO_HORA = 150;
const LIMITE_EMPRESA_DIA_PAGANTE = 500;
const LIMITE_EMPRESA_DIA_TESTE = 30;
const TAMANHO_MAX_HTML = 100_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ---- Validação da entrada (dado NÃO confiável) -----------------------------

// UM endereço de e-mail simples: sem espaço, vírgula, ponto-e-vírgula, <>, aspas.
function emailValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]{2,}$/.test(v);
}

function limparAssunto(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) : '';
}

// Comparação de texto em tempo constante (pra chave de serviço).
function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY não configurada nos secrets desta função.' }, 500);

    // ---- Quem está chamando? ----
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const interno = !!token && !!chaveServico && iguaisSeguro(token, chaveServico); // outra função nossa

    let usuario: { id: string; empresaId: string } | null = null;
    if (!interno) {
      const principal = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
      const {
        data: { user },
        error: erroAuth,
      } = await principal.auth.getUser();
      if (erroAuth || !user) return jsonResponse({ error: 'É preciso estar logado para enviar e-mails.' }, 401);
      const { data: perfil } = await principal.from('perfis').select('id, empresa_id').eq('id', user.id).single();
      if (!perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);
      usuario = { id: perfil.id, empresaId: perfil.empresa_id };
    }

    // ---- Entrada ----
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
    }
    const destinatario = body?.destinatario;
    const assunto = limparAssunto(body?.assunto);
    const corpoHtml = body?.corpoHtml;
    if (!emailValido(destinatario)) return jsonResponse({ error: 'destinatario deve ser um único e-mail válido.' }, 400);
    if (!assunto) return jsonResponse({ error: 'assunto é obrigatório.' }, 400);
    if (typeof corpoHtml !== 'string' || !corpoHtml.trim() || corpoHtml.length > TAMANHO_MAX_HTML) {
      return jsonResponse({ error: `corpoHtml é obrigatório e deve ter até ${TAMANHO_MAX_HTML} caracteres.` }, 400);
    }

    // ---- Limites (só pra usuários logados; funções internas têm as próprias travas) ----
    if (usuario) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const contar = async (chave: string, horas: number) => {
        const desde = new Date(Date.now() - horas * 3600000).toISOString();
        const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', 'enviar_email').gte('criado_em', desde);
        return count || 0;
      };
      const chaveUsuario = `email:usuario:${usuario.id}`;
      const chaveEmpresa = `email:empresa:${usuario.empresaId}`;
      if ((await contar(chaveUsuario, 1)) >= LIMITE_USUARIO_HORA) {
        return jsonResponse({ error: 'Limite de e-mails por hora atingido. Tente novamente mais tarde.' }, 429);
      }
      const { data: empresa } = await admin.from('empresas').select('is_pagante').eq('id', usuario.empresaId).maybeSingle();
      const limiteEmpresa = empresa?.is_pagante ? LIMITE_EMPRESA_DIA_PAGANTE : LIMITE_EMPRESA_DIA_TESTE;
      if ((await contar(chaveEmpresa, 24)) >= limiteEmpresa) {
        return jsonResponse({ error: 'Limite diário de e-mails da empresa atingido. Fale com o suporte para ampliar.' }, 429);
      }
      await admin.from('rate_limit_log').insert([
        { chave: chaveUsuario, acao: 'enviar_email' },
        { chave: chaveEmpresa, acao: 'enviar_email' },
      ]);
    }

    // O remetente é SEMPRE o padrão — não existe mais o campo "remetente".
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMETENTE_PADRAO, to: [destinatario], subject: assunto, html: corpoHtml }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) return jsonResponse({ error: dados }, resposta.status);
    return jsonResponse({ ok: true, dados });
  } catch (e) {
    console.error('Erro na função enviar-email:', e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Supabase > Edge Functions > enviar-email > cole este código > Deploy.
//    O secret RESEND_API_KEY já existe. Não precisa de secret novo.
// 2) Usa a tabela rate_limit_log (sql/35-rate-limit.sql) pros limites — se ela
//    não existir, os limites ficam inativos (o resto da proteção continua).
// 3) "Verify JWT" desta função pode ficar LIGADO: quem chama de fora é sempre
//    um usuário logado (JWT de verdade) ou outra função nossa (chave de serviço).
// =========================================================================
