// =========================================================================
// NORTE — Edge Function "enviar-email"
// =========================================================================
// O que faz: recebe um pedido do app (destinatário, assunto, corpo em HTML)
// e manda pra API do Resend — mantendo a chave da API do Resend só aqui no
// servidor, nunca exposta no navegador (diferente de chamar o Resend
// direto do JavaScript do site, o que exigiria colocar a chave secreta
// visível pra qualquer pessoa que abrisse o código-fonte da página).
//
// Como implantar: veja as instruções no final deste arquivo.
// =========================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Troque pelo remetente configurado no seu domínio verificado no Resend,
// assim que tiver um (ex.: "Plataforma NORTE <notificacoes@institutoinetris.com.br>").
// Enquanto não tiver domínio próprio, o Resend permite usar este endereço de teste:
const REMETENTE_PADRAO = "Plataforma NORTE <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY não configurada nos secrets desta função." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { destinatario, assunto, corpoHtml, remetente } = await req.json();

    if (!destinatario || !assunto || !corpoHtml) {
      return new Response(
        JSON.stringify({ error: "Faltam campos obrigatórios: destinatario, assunto, corpoHtml." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente || REMETENTE_PADRAO,
        to: [destinatario],
        subject: assunto,
        html: corpoHtml,
      }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return new Response(JSON.stringify({ error: dados }), {
        status: resposta.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, dados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// =========================================================================
// COMO IMPLANTAR (passo a passo)
// =========================================================================
// 1) Instale a CLI do Supabase, se ainda não tiver:
//      npm install -g supabase
//
// 2) Faça login e vincule ao seu projeto (rode dentro da pasta do projeto,
//    onde está a pasta `supabase/`):
//      supabase login
//      supabase link --project-ref mgkmvrgfmuexgxkuslur
//
// 3) Configure a chave do Resend como "secret" da função (nunca no código):
//      supabase secrets set RESEND_API_KEY=sua_chave_aqui
//
// 4) Implante a função:
//      supabase functions deploy enviar-email
//
// Alternativa sem usar terminal: no painel do Supabase, vá em
// "Edge Functions" → "Create a new function" → nomeie "enviar-email" →
// cole o conteúdo deste arquivo (a partir da linha "import") → em
// "Secrets", adicione RESEND_API_KEY com o valor da sua chave do Resend.
// =========================================================================
