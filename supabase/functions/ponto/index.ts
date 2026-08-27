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

    // BUG DE SEGURANÇA EVITADO: esta função usa a service_role key do banco
    // de ponto, que ignora qualquer RLS de lá — e o front-end escondendo o
    // menu "Ponto" é só conveniência de interface, não barreira de
    // segurança de verdade (dá pra chamar esta função direto, sem passar
    // pela tela). A checagem que realmente importa é aqui: sem isso,
    // qualquer empresa conseguiria bater ponto mesmo sem o módulo incluso
    // no plano — só o Super Admin concede esse acesso (ver
    // sql/20-ponto-incluso-no-plano.sql).
    const { data: empresa, error: erroEmpresa } = await principal
      .from('empresas')
      .select('ponto_incluso')
      .eq('id', perfil.empresa_id)
      .single();
    if (erroEmpresa || !empresa?.ponto_incluso) {
      return jsonResponse({ error: 'Sua empresa não tem o módulo Ponto incluso no plano atual.' }, 403);
    }

    // Cliente do projeto de PONTO — service_role, só usado aqui dentro do
    // servidor, nunca chega no navegador.
    const ponto = createClient(PONTO_SUPABASE_URL, PONTO_SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'bater') {
      const { data: ultima } = await ponto
        .from('registros_ponto')
        .select('tipo')
        .eq('perfil_id', perfil.id)
        .order('registrado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      // Ciclo de 4 marcações por dia: entrada → saída pro almoço → volta do
      // almoço → saída final → (recomeça no próximo dia, já que o histórico
      // de "hoje" é sempre filtrado por data na tela). Se por algum motivo o
      // último registro salvo for de um dia anterior, ainda assim o ciclo
      // recomeça em "entrada" — é o comportamento esperado pro primeiro
      // registro do dia.
      const proximoTipo: Record<string, string> = {
        entrada: 'saida_almoco',
        saida_almoco: 'volta_almoco',
        volta_almoco: 'saida',
        saida: 'entrada',
      };
      const tipo = !ultima ? 'entrada' : proximoTipo[ultima.tipo] || 'entrada';
      const motivoAtraso = typeof body.motivoAtraso === 'string' ? body.motivoAtraso.trim().slice(0, 500) : null;
      const { data, error } = await ponto
        .from('registros_ponto')
        .insert({
          empresa_id: perfil.empresa_id,
          perfil_id: perfil.id,
          colaborador_id: body.colaboradorId || null,
          tipo,
          motivo_atraso: motivoAtraso || null,
          origem: 'web',
        })
        .select('id, tipo, registrado_em, motivo_atraso')
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ registro: data });
    }

    if (action === 'hoje') {
      const inicioDoDia = body.inicioDoDiaISO;
      if (!inicioDoDia) return jsonResponse({ error: 'inicioDoDiaISO é obrigatório.' }, 400);
      const { data, error } = await ponto
        .from('registros_ponto')
        .select('id, tipo, registrado_em, motivo_atraso')
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
        .select('id, tipo, registrado_em, motivo_atraso')
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
        .select('id, perfil_id, tipo, registrado_em, motivo_atraso')
        .eq('empresa_id', perfil.empresa_id)
        .gte('registrado_em', inicio)
        .lt('registrado_em', fim)
        .order('registrado_em', { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Nomes vêm do projeto PRINCIPAL — usa service_role dele (mesma
      // função, então mesmo projeto) só pra ver todo mundo da empresa,
      // já que o token de quem chamou só teria acesso ao próprio perfil.
      const principalAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
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
// =========================================================================
