// =========================================================================
// NORTE — Edge Function "nr1"
// =========================================================================
// Guarda no SERVIDOR as partes sensíveis do módulo NR1: campanhas,
// respostas (sem ligação com quem respondeu), quem já participou,
// consentimento de privacidade, e o log de quem viu o resultado. O
// navegador nunca recebe um despejo bruto dessas listas — só o que cada
// ação abaixo decide devolver (números consolidados, ou "só sobre mim").
//
// SST, dimensões/perguntas, inventário de risco e plano de ação CONTINUAM
// no navegador (state.nr1) — não são dados sensíveis de resposta anônima,
// são registros de gestão do RH/SST.
//
// Implantação: veja as instruções no final deste arquivo.
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

// Data de hoje no Brasil (AAAA-MM-DD). As Edge Functions rodam em UTC; o Brasil é UTC−3
// fixo (sem horário de verão desde 2019).
function hojeBrasilISO(agora: number = Date.now()): string {
  return new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
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

    const { data: perfil, error: erroPerfil } = await principal.from('perfis').select('id, empresa_id, papel, nome').eq('id', user.id).single();
    if (erroPerfil || !perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const action = body.action;
    const souGestor = ['owner', 'rh'].includes(perfil.papel);

    // Fecha automaticamente campanhas vencidas — roda em toda listagem, sem
    // depender de alguém lembrar de encerrar.
    async function fecharVencidas() {
      // BUG CORRIGIDO: "hoje" era a data em UTC, que já vira o dia seguinte às 21h
      // de Brasília — a campanha fechava 3 horas antes do fim do último dia.
      const hoje = hojeBrasilISO();
      await admin
        .from('nr1_campanhas')
        .update({ status: 'encerrada', encerrada_em: new Date().toISOString(), auto_encerrada: true })
        .eq('empresa_id', perfil.empresa_id)
        .eq('status', 'ativa')
        .lt('data_fim', hoje);
    }

    if (action === 'campanha_criar') {
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const { data, error } = await admin
        .from('nr1_campanhas')
        .insert({
          empresa_id: perfil.empresa_id,
          nome: body.nome,
          data_inicio: body.dataInicio,
          data_fim: body.dataFim,
          anonimato_minimo: body.anonimatoMinimo || 5,
          publico: body.publico || { tipo: 'todos', valor: null },
          criado_por: perfil.id,
        })
        .select('id')
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ id: data.id });
    }

    if (action === 'seed_demo') {
      // Só pra demonstração/apresentação: cria uma campanha ENCERRADA com
      // respostas sintéticas já distribuídas por setor, pra mostrar o
      // resultado consolidado funcionando sem precisar de gente real
      // respondendo. Só owner/rh, mesma trava das outras ações administrativas.
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const dimensoes = body.dimensoesSnapshot || [];
      const setoresIds: (string | null)[] = body.setoresIds && body.setoresIds.length ? body.setoresIds : [null];
      const hoje = new Date();
      const hojeBR = new Date(hoje.getTime() - 3 * 3600000); // pro cálculo de DATAS no horário do Brasil
      const { data: campanha, error: erroCamp } = await admin
        .from('nr1_campanhas')
        .insert({
          empresa_id: perfil.empresa_id,
          nome: 'Avaliação de riscos psicossociais — Demonstração',
          data_inicio: new Date(hojeBR.getTime() - 20 * 86400000).toISOString().slice(0, 10),
          data_fim: new Date(hojeBR.getTime() - 5 * 86400000).toISOString().slice(0, 10),
          anonimato_minimo: 5,
          publico: { tipo: 'todos', valor: null },
          dimensoes_snapshot: dimensoes,
          status: 'encerrada',
          publicada_em: new Date(hoje.getTime() - 20 * 86400000).toISOString(),
          encerrada_em: new Date(hoje.getTime() - 5 * 86400000).toISOString(),
        })
        .select('id')
        .single();
      if (erroCamp) return jsonResponse({ error: erroCamp.message }, 500);

      // Distribui respostas: o 1º setor da lista sempre ganha volume (>=6),
      // pra mostrar resultado "por setor" liberado; os demais ficam com
      // pouca gente, pra mostrar a agregação de grupos pequenos em ação.
      const respostas: { campanha_id: string; setor_id: string | null; por_dimensao: Record<string, number[]> }[] = [];
      setoresIds.forEach((setorId, idx) => {
        const qtd = idx === 0 ? 7 : 2;
        for (let i = 0; i < qtd; i++) {
          const porDimensao: Record<string, number[]> = {};
          dimensoes.forEach((d: { id: string; perguntas: string[] }) => {
            // Um setor sai "ruim" de propósito (nota baixa), o resto neutro/bom —
            // pra já nascer com algo pra registrar como risco na demonstração.
            const baseRuim = idx === 0 && i % 2 === 0;
            porDimensao[d.id] = d.perguntas.map(() => (baseRuim ? 1 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3)));
          });
          respostas.push({ campanha_id: campanha.id, setor_id: setorId, por_dimensao: porDimensao });
        }
      });
      if (respostas.length) {
        const { error: erroResp } = await admin.from('nr1_respostas').insert(respostas);
        if (erroResp) return jsonResponse({ error: erroResp.message }, 500);
      }
      return jsonResponse({ ok: true, campanhaId: campanha.id, respostas: respostas.length });
    }

    if (action === 'campanha_publicar') {
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const { error } = await admin
        .from('nr1_campanhas')
        .update({ status: 'ativa', dimensoes_snapshot: body.dimensoesSnapshot, publicada_em: new Date().toISOString() })
        .eq('id', body.campanhaId)
        .eq('empresa_id', perfil.empresa_id)
        .eq('status', 'rascunho');
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'campanha_encerrar') {
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const { error } = await admin
        .from('nr1_campanhas')
        .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
        .eq('id', body.campanhaId)
        .eq('empresa_id', perfil.empresa_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'campanha_listar') {
      await fecharVencidas();
      const { data: campanhas, error } = await admin
        .from('nr1_campanhas')
        .select('id, nome, data_inicio, data_fim, anonimato_minimo, publico, dimensoes_snapshot, status, auto_encerrada, criado_em')
        .eq('empresa_id', perfil.empresa_id)
        .order('criado_em', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Contagem de respostas por campanha (número só — nunca a lista).
      const comContagem = await Promise.all(
        (campanhas || []).map(async (c) => {
          const { count } = await admin.from('nr1_respostas').select('id', { count: 'exact', head: true }).eq('campanha_id', c.id);
          return { ...c, totalRespostas: count || 0 };
        })
      );
      return jsonResponse({ campanhas: comContagem });
    }

    if (action === 'meu_status') {
      // Só sobre a própria pessoa — se já respondeu e se já aceitou o aviso
      // de privacidade, para cada campanha. Não expõe dados de mais ninguém.
      const { data: participacoes } = await admin.from('nr1_participantes').select('campanha_id').eq('perfil_id', perfil.id);
      const { data: consentimentos } = await admin.from('nr1_consentimentos').select('campanha_id').eq('perfil_id', perfil.id);
      return jsonResponse({
        respondidas: (participacoes || []).map((p) => p.campanha_id),
        aceitas: (consentimentos || []).map((c) => c.campanha_id),
      });
    }

    if (action === 'consentimento_aceitar') {
      const { error } = await admin
        .from('nr1_consentimentos')
        .upsert({ campanha_id: body.campanhaId, perfil_id: perfil.id }, { onConflict: 'campanha_id,perfil_id' });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'responder') {
      const { data: campanha } = await admin
        .from('nr1_campanhas')
        .select('status, publico')
        .eq('id', body.campanhaId)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      if (!campanha || campanha.status !== 'ativa') return jsonResponse({ error: 'Esta campanha não está mais ativa.' }, 409);

      // Confere elegibilidade no SERVIDOR — a segmentação por unidade/
      // setor/cargo/lista não pode depender só do que o navegador filtra na
      // tela; senão, alguém poderia responder a uma campanha que não é dela.
      const publico = campanha.publico || { tipo: 'todos' };
      if (publico.tipo && publico.tipo !== 'todos') {
        const { data: dadosRow } = await principal.from('dados_sistema').select('payload').eq('empresa_id', perfil.empresa_id).maybeSingle();
        const colaboradores = dadosRow?.payload?.colaboradores || [];
        const colaborador = colaboradores.find((c: { perfilId: string }) => c.perfilId === perfil.id);
        const elegivel =
          !colaborador
            ? false
            : publico.tipo === 'unidade'
              ? colaborador.unidadeId === publico.valor
              : publico.tipo === 'setor'
                ? colaborador.setorId === publico.valor
                : publico.tipo === 'cargo'
                  ? colaborador.cargoId === publico.valor
                  : publico.tipo === 'lista'
                    ? (publico.valor || []).includes(colaborador.id)
                    : true;
        if (!elegivel) return jsonResponse({ error: 'Você não é elegível para responder esta campanha.' }, 403);
      }

      // Registra a PARTICIPAÇÃO primeiro (trava única por campanha+pessoa).
      // Se já existir, rejeita ANTES de gravar uma resposta duplicada.
      const { error: erroParticipacao } = await admin.from('nr1_participantes').insert({ campanha_id: body.campanhaId, perfil_id: perfil.id });
      if (erroParticipacao) {
        if (String(erroParticipacao.code) === '23505') return jsonResponse({ error: 'Você já respondeu esta campanha.' }, 409);
        return jsonResponse({ error: erroParticipacao.message }, 500);
      }

      // A resposta em si NÃO leva perfil_id — nem o servidor liga ao autor.
      const { error: erroResposta } = await admin.from('nr1_respostas').insert({
        campanha_id: body.campanhaId,
        setor_id: body.setorId || null,
        unidade_id: body.unidadeId || null,
        por_dimensao: body.porDimensao,
      });
      if (erroResposta) return jsonResponse({ error: erroResposta.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'resultado_consolidado') {
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const { data: campanha } = await admin
        .from('nr1_campanhas')
        .select('id, anonimato_minimo, dimensoes_snapshot')
        .eq('id', body.campanhaId)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      if (!campanha) return jsonResponse({ error: 'Campanha não encontrada.' }, 404);

      const { data: respostas, error } = await admin.from('nr1_respostas').select('setor_id, por_dimensao').eq('campanha_id', body.campanhaId);
      if (error) return jsonResponse({ error: error.message }, 500);

      // Estrutura (nomes de setor/unidade e hierarquia) vem do blob da
      // empresa — não é dado sensível, é o cadastro organizacional normal.
      const { data: dadosRow } = await principal.from('dados_sistema').select('payload').eq('empresa_id', perfil.empresa_id).maybeSingle();
      const estrutura = dadosRow?.payload?.estrutura || [];

      // Registra a visualização (cada chamada desta ação = uma vez que
      // alguém abriu o resultado consolidado).
      await admin.from('nr1_visualizacoes').insert({ campanha_id: body.campanhaId, perfil_id: perfil.id });

      return jsonResponse({
        anonimatoMinimo: campanha.anonimato_minimo,
        dimensoesSnapshot: campanha.dimensoes_snapshot,
        respostas: respostas || [], // sem perfil_id — só setor_id e as notas
        estrutura, // { id, nome, paiId, tipo } — pra nomear/agregar por hierarquia no front
      });
    }

    if (action === 'log_visualizacoes') {
      if (!souGestor) return jsonResponse({ error: 'Sem permissão.' }, 403);
      // Confirma que a campanha é da MESMA empresa de quem pergunta — sem
      // isso, alguém poderia consultar o log de outra empresa só sabendo o id.
      const { data: campanhaDono } = await admin.from('nr1_campanhas').select('id').eq('id', body.campanhaId).eq('empresa_id', perfil.empresa_id).maybeSingle();
      if (!campanhaDono) return jsonResponse({ error: 'Campanha não encontrada.' }, 404);
      const { data, error } = await admin
        .from('nr1_visualizacoes')
        .select('perfil_id, visualizado_em')
        .eq('campanha_id', body.campanhaId)
        .order('visualizado_em', { ascending: false })
        .limit(5);
      if (error) return jsonResponse({ error: error.message }, 500);
      const total = await admin.from('nr1_visualizacoes').select('id', { count: 'exact', head: true }).eq('campanha_id', body.campanhaId);
      const ids = [...new Set((data || []).map((l) => l.perfil_id))];
      const { data: perfis } = await principal.from('perfis').select('id, nome').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      const nomePorId = Object.fromEntries((perfis || []).map((p) => [p.id, p.nome]));
      return jsonResponse({
        total: total.count || 0,
        ultimas: (data || []).map((l) => ({ nome: nomePorId[l.perfil_id] || 'Alguém', em: l.visualizado_em })),
      });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função nr1:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode antes o sql/27-nr1-servidor.sql no projeto PRINCIPAL.
// 2) No Supabase, projeto PRINCIPAL: Edge Functions → New Function → nome
//    exato: nr1 → cole este código → Deploy.
// 3) Não precisa configurar secrets novos — já existem automaticamente.
// =========================================================================
