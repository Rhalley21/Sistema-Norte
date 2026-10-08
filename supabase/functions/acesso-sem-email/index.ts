// =========================================================================
// NORTE — Edge Function "acesso-sem-email"
// =========================================================================
// O que faz: dá acesso ao sistema a colaboradores que não têm e-mail nem
// celular corporativo. O RH informa um "login" (uma matrícula) e a função:
//   1. Cria um convite (reaproveita a tabela `convites` já existente —
//      mesmo mecanismo de sempre, então a trigger handle_new_user cuida de
//      criar o perfil certo, sem precisar mudar nada nela).
//   2. Cria o usuário no Supabase Auth com um e-mail SINTÉTICO (nunca é
//      enviado a lugar nenhum — só serve de identificador técnico, porque
//      o Supabase Auth exige um e-mail no cadastro) e uma senha provisória
//      gerada aqui.
//   3. Devolve o login e a senha provisória pro RH anotar e entregar à
//      pessoa. A senha não é guardada em lugar nenhum além do hash do
//      próprio Supabase Auth — se o RH não copiar agora, não tem como
//      recuperá-la depois (só gerar uma nova).
//
// Só owner/rh da empresa podem chamar. O e-mail sintético usa o formato
// "<login>.<empresaId>@acesso.norte.interno" — único por empresa mesmo que
// o "login" escolhido pelo RH se repita entre empresas diferentes.
//
// Como implantar: veja as instruções no final deste arquivo.
// =========================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// BUG DE SEGURANÇA CORRIGIDO: a senha provisória e o código de convite eram sorteados com
// Math.random(), que não é criptograficamente seguro (dá pra prever as próximas saídas a
// partir de algumas anteriores). Estes valores dão ACESSO a uma conta, então usam
// crypto.getRandomValues — e descartam os bytes que causariam viés no sorteio.
function sortearTexto(chars: string, n: number): string {
  const limite = 256 - (256 % chars.length);
  let saida = '';
  while (saida.length < n) {
    // (getRandomValues aceita no máximo 65536 bytes por chamada)
    const bytes = new Uint8Array(Math.min((n - saida.length) * 2, 4096));
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limite && saida.length < n) saida += chars[b % chars.length];
    }
  }
  return saida;
}

function gerarCodigoConvite(): string {
  return 'NORTE-' + sortearTexto('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8); // sem O/0/I/1, pra não confundir na digitação
}

function gerarSenhaProvisoria(): string {
  return sortearTexto('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', 12);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const principal = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: erroAuth,
    } = await principal.auth.getUser();
    if (erroAuth || !user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);

    const { data: perfilChamador, error: erroPerfil } = await principal
      .from('perfis')
      .select('id, empresa_id, papel')
      .eq('id', user.id)
      .single();
    if (erroPerfil || !perfilChamador) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);
    if (!['owner', 'rh'].includes(perfilChamador.papel)) {
      return jsonResponse({ error: 'Apenas Administrador ou RH podem criar acesso sem e-mail.' }, 403);
    }

    const body = await req.json();
    const loginBruto = String(body.login || '').trim();
    const nome = String(body.nome || '').trim();
    const papelNovo = ['rh', 'lider', 'colaborador'].includes(body.papel) ? body.papel : 'colaborador';
    if (!loginBruto || !nome) {
      return jsonResponse({ error: 'Informe o login (matrícula) e o nome.' }, 400);
    }
    const login = loginBruto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]/g, '');
    if (!login) return jsonResponse({ error: 'Login inválido — use letras e números.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1) Cria o convite (mesmo mecanismo que já existe pro convite por e-mail).
    const codigoConvite = gerarCodigoConvite();
    const { error: erroConvite } = await admin.from('convites').insert({
      empresa_id: perfilChamador.empresa_id,
      codigo: codigoConvite,
      papel: papelNovo,
      criado_por: perfilChamador.id,
    });
    if (erroConvite) return jsonResponse({ error: 'Falha ao gerar o convite: ' + erroConvite.message }, 500);

    // 2) Cria o usuário no Auth com e-mail sintético + senha provisória.
    //    O e-mail nunca é usado pra enviar nada — é só o identificador que
    //    o Supabase Auth exige tecnicamente. A pessoa loga digitando esse
    //    "e-mail" (funciona como usuário) + a senha provisória.
    const emailSintetico = `${login}.${perfilChamador.empresa_id.slice(0, 8)}@acesso.norte.interno`;
    const senhaProvisoria = gerarSenhaProvisoria();
    const { data: novoUsuario, error: erroCriar } = await admin.auth.admin.createUser({
      email: emailSintetico,
      password: senhaProvisoria,
      email_confirm: true, // não existe e-mail de verdade pra confirmar
      user_metadata: { codigo_convite: codigoConvite, nome },
    });
    if (erroCriar || !novoUsuario?.user) {
      // Desfaz o convite se a criação do usuário falhar (ex: login já em uso).
      await admin.from('convites').delete().eq('codigo', codigoConvite);
      const msg = String(erroCriar?.message || '');
      if (msg.includes('already been registered') || msg.includes('already registered')) {
        return jsonResponse({ error: 'Esse login já está em uso. Escolha outro.' }, 409);
      }
      return jsonResponse({ error: 'Falha ao criar o acesso: ' + msg }, 500);
    }

    // 3) Marca a senha como provisória — o login força a troca na primeira vez.
    await admin.from('perfis').update({ senha_provisoria: true }).eq('id', novoUsuario.user.id);

    return jsonResponse({
      perfilId: novoUsuario.user.id,
      login: emailSintetico,
      senhaProvisoria,
    });
  } catch (e) {
    console.error('Erro em acesso-sem-email:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) No Supabase, projeto PRINCIPAL: Edge Functions → New Function → nome
//    exato: acesso-sem-email → cole este código → Deploy.
// 2) Não precisa configurar secrets novos: SUPABASE_URL,
//    SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem
//    automaticamente em toda Edge Function deste projeto.
// 3) Rode antes o sql/25-acesso-sem-email.sql (adiciona a coluna
//    senha_provisoria na tabela perfis).
// =========================================================================
