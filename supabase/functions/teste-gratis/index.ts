// =========================================================================
// NORTE — Edge Function "teste-gratis"
// =========================================================================
// Pública (sem login) — chamada direto da landing comercial. Automatiza
// 100% o fluxo que antes exigia o Super Admin clicar em "Aprovar": valida
// o reCAPTCHA, gera o código de licença de teste (7 dias), registra a
// solicitação já aprovada, e envia o e-mail com o código — tudo numa
// chamada só. Sem revisão humana (decisão: automação total, protegida só
// pelo reCAPTCHA).
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

async function validarRecaptcha(token: string): Promise<boolean> {
  const secret = Deno.env.get('RECAPTCHA_SECRET_KEY');
  if (!secret || !token) return false;
  try {
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${secret}&response=${token}`,
    });
    const data = await resp.json();
    return !!data.success;
  } catch {
    return false;
  }
}

// Mesma lógica de sql/23-page-super-admin.js (gerarCodigoLicencaLetras),
// só que rodando no servidor — crypto.getRandomValues() também existe
// nativamente no Deno, mesma família seguramente aleatória.
function gerarCodigoLicenca(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I, pra evitar confusão
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let c = 'NORTE-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) c += '-';
    c += chars[bytes[i] % chars.length];
  }
  return c;
}

// Confere quantas tentativas essa chave (normalmente o IP) já fez pra essa
// ação na janela de tempo — se já bateu no limite, recusa. Senão, registra
// mais uma tentativa e deixa passar. "admin" é o client com chave de
// serviço (só ele lê/escreve em rate_limit_log — ver sql/35-rate-limit.sql).
async function dentroDoLimite(admin: any, chave: string, acao: string, maxTentativas: number, janelaHoras: number): Promise<boolean> {
  const desde = new Date(Date.now() - janelaHoras * 3600000).toISOString();
  const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', acao).gte('criado_em', desde);
  if ((count || 0) >= maxTentativas) return false;
  await admin.from('rate_limit_log').insert({ chave, acao });
  return true;
}

function ipDoRequisitante(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'desconhecido';
}

// ---- Entrada do formulário PÚBLICO: dado não confiável --------------------------
// UM endereço de e-mail simples (sem espaço, vírgula, ponto-e-vírgula, <>, aspas).
function emailValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]{2,}$/.test(v);
}
// Nome e empresa vão pro HTML do e-mail: sem escape, alguém poderia mandar um e-mail
// da INETRIS, pro endereço de qualquer pessoa, com links e texto à escolha.
function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const nome = String(body.nome || '').trim().slice(0, 120);
    const email = String(body.email || '').trim();
    const nomeEmpresa = String(body.empresa || '').trim().slice(0, 160);
    const telefone = String(body.telefone || '').trim().slice(0, 40);

    const adminRateLimit = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ip = ipDoRequisitante(req);
    // No máximo 3 solicitações de teste grátis por IP a cada 24h — dá
    // espaço pra alguém testar de novo se errar algo, mas barra geração em
    // massa de códigos.
    if (!(await dentroDoLimite(adminRateLimit, ip, 'teste_gratis', 3, 24))) {
      return jsonResponse({ error: 'Muitas solicitações vindas deste endereço. Tente novamente mais tarde ou entre em contato com o suporte.' }, 429);
    }

    const recaptchaOk = await validarRecaptcha(body.recaptchaToken);
    if (!recaptchaOk) {
      return jsonResponse({ error: 'Não foi possível confirmar que você não é um robô. Tente novamente.' }, 400);
    }
    if (!nome || !email || !nomeEmpresa) {
      return jsonResponse({ error: 'Preencha nome, e-mail e nome da empresa.' }, 400);
    }
    if (!emailValido(email)) {
      return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
    }

    const admin = adminRateLimit; // mesma instância, reaproveitada

    const codigo = gerarCodigoLicenca();
    const { error: erroCodigo } = await admin.from('codigos_licenca_empresa').insert({
      codigo,
      nome_empresa_sugerido: nomeEmpresa,
      trial_dias: 7,
    });
    if (erroCodigo) return jsonResponse({ error: erroCodigo.message }, 500);

    // Registra a solicitação já como aprovada — pra manter o histórico e a
    // visão consolidada no painel do Super Admin, mesmo sem revisão manual.
    const { error: erroSolicitacao } = await admin.from('solicitacoes_teste').insert({
      nome_solicitante: nome,
      email,
      nome_empresa: nomeEmpresa,
      telefone: telefone || null,
      status: 'aprovada',
      codigo_gerado: codigo,
      decidido_em: new Date().toISOString(),
    });
    if (erroSolicitacao) console.error('Falha ao registrar solicitação (código já foi gerado, segue mesmo assim):', erroSolicitacao);

    // E-mail com o código — usando os nomes de campo CORRETOS
    // (destinatario/corpoHtml), diferente do bug que existia antes aqui.
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          destinatario: email,
          assunto: 'Seu teste grátis do INETRIS foi liberado 🎉',
          corpoHtml: `<p>Olá, ${escaparHtml(nome)}!</p>
            <p>Seu teste grátis de 7 dias da plataforma INETRIS (Sistema de Gestão de Pessoas) foi liberado para a empresa <b>${escaparHtml(nomeEmpresa)}</b>.</p>
            <p>Para começar, acesse o sistema, clique em <b>Cadastrar</b> e use este código de licença:</p>
            <p style="font-size:20px;font-weight:bold;letter-spacing:1px;">${codigo}</p>
            <p>O teste vale por 7 dias a partir do seu cadastro. Qualquer dúvida, é só responder este e-mail.</p>
            <p>Instituto INETRIS</p>`,
        }),
      });
    } catch (e) {
      console.error('Falha ao enviar e-mail de teste grátis (código já foi gerado, segue mesmo assim):', e);
    }

    return jsonResponse({ codigo });
  } catch (e) {
    console.error('Erro na função teste-gratis:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) No Supabase, projeto PRINCIPAL: Edge Functions → New Function → nome
//    exato: teste-gratis → cole este código → Deploy.
// 2) Configure o secret RECAPTCHA_SECRET_KEY (mesmo valor já usado na
//    função "rs") — sem isso, toda solicitação é rejeitada.
// 3) "Verify JWT": esta função é chamada da página de vendas SEM login, só com a
//    chave pública do projeto. Se o projeto usa as chaves novas (sb_publishable_...),
//    que não são JWT, deixe "Verify JWT" DESLIGADO — senão toda chamada volta 401.
//    A função se protege sozinha (reCAPTCHA + limite por IP).
// =========================================================================
