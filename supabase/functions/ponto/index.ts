// =========================================================================
// NORTE — Edge Function "ponto"
// =========================================================================
// O que faz: é a ponte entre o projeto Supabase principal (onde mora o
// login e o resto do sistema) e o projeto Supabase SEPARADO que guarda só
// os registros de ponto (ver sql-ponto-db/01-schema.sql).
//
// Por que uma Edge Function, e não o navegador falando direto com o banco
// de ponto: o front-end só tem a sessão de login do projeto PRINCIPAL —
// ele não tem (e não deve ter) nenhuma chave do projeto de ponto. Esta
// função recebe o pedido já autenticado pelo projeto principal, confere
// aqui dentro (servidor) quem é a pessoa e a que empresa ela pertence, e
// só then usa a service_role key do projeto de ponto — que fica guardada
// como secret aqui, nunca exposta no navegador — pra gravar ou consultar.
//
// Ações aceitas no corpo da requisição (JSON): { action: "bater" | "hoje" | "semana", ... }
//   - "bater": registra a próxima batida (entrada/saída, decidido aqui no
//     servidor, olhando a última batida da pessoa — evita duas abas
//     batendo ao mesmo tempo e gerando duas entradas seguidas).
//   - "hoje": lista as batidas de HOJE da própria pessoa logada.
//   - "semana": lista as batidas da empresa inteira numa semana — só
//     libera se a pessoa logada for "owner" ou "rh" (mesma regra de quem
//     acessa Relatórios no sistema principal).
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

// ---- QR rotativo: assina/valida um token curto baseado em janela de tempo.
// token = "janela.hmac". A janela troca a cada PONTO_QR_PERIODO_S segundos.
// O hmac prova que o token foi gerado por quem conhece o segredo da empresa
// (a Edge Function e o totem via Edge Function) — o funcionário não consegue
// forjar o código do próximo instante. Aceitamos algumas janelas anteriores
// pra tolerar o tempo entre exibir → escanear → enviar.
const PONTO_QR_PERIODO_S = 20;
const PONTO_QR_JANELAS_TOLERADAS = 3; // ~60s de validade efetiva

async function hmacHex(mensagem: string, segredo: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', key, enc.encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function gerarTokenQr(empresaId: string, segredo: string): Promise<string> {
  const janela = Math.floor(Date.now() / 1000 / PONTO_QR_PERIODO_S);
  return `${janela}.${await hmacHex(`${empresaId}:${janela}`, segredo)}`;
}

async function validarTokenQr(token: string, empresaId: string, segredo: string): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const [janelaStr, hmac] = token.split('.');
  const janela = parseInt(janelaStr, 10);
  if (isNaN(janela)) return false;
  const janelaAtual = Math.floor(Date.now() / 1000 / PONTO_QR_PERIODO_S);
  for (let k = 0; k < PONTO_QR_JANELAS_TOLERADAS; k++) {
    const j = janelaAtual - k;
    if (janela === j && hmac === (await hmacHex(`${empresaId}:${j}`, segredo))) return true;
  }
  return false;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const PONTO_SUPABASE_URL = Deno.env.get('PONTO_SUPABASE_URL');
    const PONTO_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('PONTO_SUPABASE_SERVICE_ROLE_KEY');
    if (!PONTO_SUPABASE_URL || !PONTO_SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        { error: 'PONTO_SUPABASE_URL / PONTO_SUPABASE_SERVICE_ROLE_KEY não configuradas nos secrets desta função.' },
        500
      );
    }

    // Cliente do projeto PRINCIPAL, autenticado com o mesmo token de quem
    // chamou (o supabase-js do front-end já reenvia o Authorization da
    // sessão atual automaticamente em toda chamada a functions.invoke).
    const authHeader = req.headers.get('Authorization') || '';
    const principal = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: erroAuth,
    } = await principal.auth.getUser();
    if (erroAuth || !user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);

    const { data: perfil, error: erroPerfil } = await principal
      .from('perfis')
      .select('id, empresa_id, papel')
      .eq('id', user.id)
      .single();
    if (erroPerfil || !perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);

    // Cliente do projeto de PONTO — service_role, só usado aqui dentro do
    // servidor, nunca chega no navegador.
    const ponto = createClient(PONTO_SUPABASE_URL, PONTO_SUPABASE_SERVICE_ROLE_KEY);

    // Cliente ADMIN do projeto principal (service_role) — necessário pra ler a
    // tabela empresa_ponto_seguranca, que o navegador não pode enxergar.
    const principalAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    async function segurancaDaEmpresa() {
      const { data } = await principalAdmin
        .from('empresa_ponto_seguranca')
        .select('qr_secret, exige_qr, exige_selfie')
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      if (data) return data;
      // Primeira vez: cria a linha (com segredo aleatório) e devolve.
      const { data: nova } = await principalAdmin
        .from('empresa_ponto_seguranca')
        .insert({ empresa_id: perfil.empresa_id })
        .select('qr_secret, exige_qr, exige_selfie')
        .single();
      return nova;
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- Configuração de segurança (ler / salvar) ----
    if (action === 'seguranca_ler') {
      const seg = await segurancaDaEmpresa();
      return jsonResponse({ exigeQr: !!seg?.exige_qr, exigeSelfie: !!seg?.exige_selfie });
    }
    if (action === 'seguranca_salvar') {
      if (perfil.papel !== 'owner' && perfil.papel !== 'rh') {
        return jsonResponse({ error: 'Só RH ou Administrador podem mudar a segurança do ponto.' }, 403);
      }
      await segurancaDaEmpresa(); // garante que a linha existe
      const { error } = await principalAdmin
        .from('empresa_ponto_seguranca')
        .update({ exige_qr: !!body.exigeQr, exige_selfie: !!body.exigeSelfie, atualizado_em: new Date().toISOString() })
        .eq('empresa_id', perfil.empresa_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ exigeQr: !!body.exigeQr, exigeSelfie: !!body.exigeSelfie });
    }

    // ---- Totem: código QR do momento (só owner/rh podem exibir) ----
    if (action === 'qr_atual') {
      if (perfil.papel !== 'owner' && perfil.papel !== 'rh') {
        return jsonResponse({ error: 'Sem permissão para exibir o totem.' }, 403);
      }
      const seg = await segurancaDaEmpresa();
      const token = await gerarTokenQr(perfil.empresa_id, seg.qr_secret);
      return jsonResponse({ token, periodoS: PONTO_QR_PERIODO_S });
    }

    if (action === 'bater') {
      const seg = await segurancaDaEmpresa();

      // Se a empresa exige QR, o token precisa ser válido e do momento.
      if (seg?.exige_qr) {
        const ok = await validarTokenQr(body.qrToken || '', perfil.empresa_id, seg.qr_secret);
        if (!ok) {
          return jsonResponse(
            { error: 'Código do local inválido ou expirado. Escaneie o QR Code que está na empresa.', codigo: 'qr_invalido' },
            403
          );
        }
      }

      // Se a empresa exige selfie, precisa vir a foto.
      if (seg?.exige_selfie && !body.selfieBase64) {
        return jsonResponse({ error: 'É necessário tirar a selfie para bater o ponto.', codigo: 'selfie_faltando' }, 400);
      }

      const { data: ultima } = await ponto
        .from('registros_ponto')
        .select('tipo')
        .eq('perfil_id', perfil.id)
        .order('registrado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      const tipo = !ultima || ultima.tipo === 'saida' ? 'entrada' : 'saida';

      // Sobe a selfie pro Storage (bucket privado "selfies-ponto"), se veio.
      let selfiePath: string | null = null;
      if (body.selfieBase64) {
        try {
          const base64 = String(body.selfieBase64).split(',').pop() || '';
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const nome = `${perfil.empresa_id}/${perfil.id}/${Date.now()}.jpg`;
          const up = await ponto.storage.from('selfies-ponto').upload(nome, bytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });
          if (!up.error) selfiePath = nome;
          else console.error('Falha ao subir selfie', up.error);
        } catch (e) {
          console.error('Erro processando selfie', e);
        }
      }

      const { data, error } = await ponto
        .from('registros_ponto')
        .insert({
          empresa_id: perfil.empresa_id,
          perfil_id: perfil.id,
          colaborador_id: body.colaboradorId || null,
          tipo,
          origem: 'web',
          validado_qr: !!seg?.exige_qr,
          selfie_path: selfiePath,
        })
        .select('id, tipo, registrado_em')
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ registro: data });
    }

    if (action === 'hoje') {
      const inicioDoDia = body.inicioDoDiaISO;
      if (!inicioDoDia) return jsonResponse({ error: 'inicioDoDiaISO é obrigatório.' }, 400);
      const { data, error } = await ponto
        .from('registros_ponto')
        .select('id, tipo, registrado_em')
        .eq('perfil_id', perfil.id)
        .gte('registrado_em', inicioDoDia)
        .order('registrado_em', { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ registros: data || [] });
    }

    if (action === 'periodo') {
      // Igual a "hoje", mas com início e fim livres — usado pra montar o
      // gráfico dos últimos dias. Sempre só a própria pessoa (perfil.id),
      // então não precisa de nenhuma checagem extra de papel.
      const desde = body.desdeISO;
      const ate = body.ateISO;
      if (!desde || !ate) return jsonResponse({ error: 'desdeISO e ateISO são obrigatórios.' }, 400);
      const { data, error } = await ponto
        .from('registros_ponto')
        .select('id, tipo, registrado_em')
        .eq('perfil_id', perfil.id)
        .gte('registrado_em', desde)
        .lt('registrado_em', ate)
        .order('registrado_em', { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ registros: data || [] });
    }

    if (action === 'semana') {
      if (perfil.papel !== 'owner' && perfil.papel !== 'rh') {
        return jsonResponse({ error: 'Só RH ou Administrador podem exportar o consolidado da empresa.' }, 403);
      }
      const inicio = body.inicioISO;
      const fim = body.fimISO;
      if (!inicio || !fim) return jsonResponse({ error: 'inicioISO e fimISO são obrigatórios.' }, 400);
      const { data: registros, error } = await ponto
        .from('registros_ponto')
        .select('id, perfil_id, tipo, registrado_em')
        .eq('empresa_id', perfil.empresa_id)
        .gte('registrado_em', inicio)
        .lt('registrado_em', fim)
        .order('registrado_em', { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Nomes vêm do projeto PRINCIPAL — usa service_role dele (mesma
      // função, então mesmo projeto) só pra ver todo mundo da empresa,
      // já que o token de quem chamou só teria acesso ao próprio perfil.
      const idsUnicos = [...new Set((registros || []).map((r) => r.perfil_id))];
      const { data: perfis } = await principalAdmin.from('perfis').select('id, nome').in('id', idsUnicos);
      const nomePorId = Object.fromEntries((perfis || []).map((p) => [p.id, p.nome]));

      return jsonResponse({
        registros: (registros || []).map((r) => ({
          ...r,
          nome: nomePorId[r.perfil_id] || 'Conta removida',
        })),
      });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR (passo a passo)
// =========================================================================
// 1) Primeiro rode sql-ponto-db/01-schema.sql no projeto Supabase NOVO
//    (separado), e guarde a Project URL + service_role key dele.
//
// 2) No projeto PRINCIPAL (o mesmo de sempre — mgkmvrgfmuexgxkuslur):
//      supabase functions deploy ponto
//
// 3) Configure os secrets desta função, com os dados do projeto NOVO de
//    ponto (não confundir com as chaves do projeto principal):
//      supabase secrets set PONTO_SUPABASE_URL=https://xxxxx.supabase.co
//      supabase secrets set PONTO_SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_do_projeto_de_ponto
//
//    SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY do
//    projeto PRINCIPAL já existem automaticamente em toda Edge Function —
//    não precisam ser configuradas à mão.
//
// Alternativa sem terminal: painel do Supabase (projeto principal) →
// "Edge Functions" → "Create a new function" → nomeie "ponto" → cole este
// arquivo (a partir da linha "import") → em "Secrets", adicione
// PONTO_SUPABASE_URL e PONTO_SUPABASE_SERVICE_ROLE_KEY com os valores do
// projeto novo.
//
// -------------------------------------------------------------------------
// PARA O PONTO SEGURO (QR + selfie), além do acima, uma vez:
//   a) Projeto PRINCIPAL: rode sql/22-ponto-seguranca.sql.
//   b) Projeto de PONTO:  rode sql-ponto-db/02-seguranca-batida.sql e crie
//      um bucket de Storage PRIVADO chamado exatamente "selfies-ponto".
//   c) Reimplante esta função (deploy) para valer a nova lógica.
// Nenhum secret novo é necessário — esta função já usa as chaves existentes.
// =========================================================================
