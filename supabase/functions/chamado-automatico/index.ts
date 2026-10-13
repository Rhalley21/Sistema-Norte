// =========================================================================
// NORTE — Edge Function "chamado-automatico"
// =========================================================================
// Automatiza o ciclo dos chamados de suporte, com a equipe só entrando quando
// precisa:
//
//   processar  -> logo depois que um chamado é aberto, o assistente de IA tenta
//                 respondê-lo (usando a mesma base de conhecimento do chat) e o
//                 cliente recebe a resposta por e-mail. Se for assunto de
//                 cobrança, cancelamento, exclusão de dados (LGPD), jurídico ou
//                 segurança — ou se a IA disser que não sabe — NÃO responde: o
//                 chamado fica "aberto" pra uma pessoa.
//   feedback   -> o cliente diz se a resposta resolveu. "Resolveu" fecha o
//                 chamado; "Ainda preciso de ajuda" passa pra equipe (que recebe
//                 e-mail na hora).
//   rotina     -> chamada de hora em hora pelo agendador (pg_cron): encerra
//                 sozinho chamado respondido pela IA sem retorno do cliente há 3
//                 dias, lembra a equipe de chamado parado há mais de 24h e manda
//                 um resumo diário (8h de Brasília).
//
// Todas as ações se autenticam aqui dentro (usuário logado ou segredo do
// agendador) — por isso "Verify JWT" desta função deve ficar DESLIGADO.
// =========================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const EMAIL_EQUIPE = Deno.env.get('EMAIL_EQUIPE') || 'inetris25@gmail.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const DIAS_AUTOFECHAR = 3;
const HORAS_LEMBRETE = 24;
const HORA_RESUMO_BRASIL = 8;

// ---- Ajudantes puros (testados) ----------------------------------------------

function escaparHtml(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function protocoloDe(id: string): string {
  return String(id || '').slice(0, 8).toUpperCase();
}

// Assuntos que NUNCA são respondidos pela IA, mesmo que ela quisesse: dinheiro,
// cancelamento, dados pessoais (LGPD), jurídico e incidente de segurança. Uma
// resposta errada aqui custa caro — vão direto pra uma pessoa.
const ASSUNTOS_SO_HUMANO: RegExp[] = [
  /\blgpd\b|meus dados|dados pessoais|exclus[aã]o de dados|(apagar|excluir|remover) (os |meus )?dados|portabilidade|direito[s]? do titular/i,
  /cobran[cç]a|boleto|fatura|nota fiscal|reembolso|estorno|cart[aã]o de cr[eé]dito|segunda via|pagamento (n[aã]o|atrasad|duplicad|recusad)/i,
  /cancel\w*(\s+(o|a|os|as|um|uma|meu|minha|nosso|nossa|este|esse|esta|essa|todo|toda|do|da|de)){0,3}\s+(plano|contrato|assinatura|conta)\b|rescis[aã]o/i,
  /processo trabalhista|advogado|notifica[cç][aã]o extrajudicial|ouvidoria|procon|a[cç][aã]o judicial/i,
  /vazamento|invadid|hackead|senha (vazou|roubad)|acesso indevido|conta (foi )?invadida/i,
];
function exigeAtendimentoHumano(assunto: string, mensagem: string): boolean {
  const texto = `${assunto}\n${mensagem}`;
  return ASSUNTOS_SO_HUMANO.some((r) => r.test(texto));
}

// O que vai pra IA: o assunto e o texto do chamado como uma pergunta só.
function perguntaDoChamado(assunto: string, mensagem: string): string {
  return `Assunto: ${assunto}\n\n${mensagem}`.slice(0, 1200);
}

type ChamadoRotina = {
  status: string;
  criado_em: string;
  respondido_em: string | null;
  feedback_cliente: string | null;
  lembrete_enviado_em: string | null;
};
// Respondido pela IA e o cliente não disse nada por N dias: encerra.
function precisaFechar(c: ChamadoRotina, agora: number, dias: number): boolean {
  return c.status === 'respondido_ia' && !c.feedback_cliente && !!c.respondido_em && agora - Date.parse(c.respondido_em) >= dias * 86400000;
}
// Parado esperando a equipe há mais de N horas, e sem lembrete nas últimas N horas.
function precisaLembrete(c: ChamadoRotina, agora: number, horas: number): boolean {
  if (c.status !== 'aberto' && c.status !== 'em_andamento') return false;
  if (agora - Date.parse(c.criado_em) < horas * 3600000) return false;
  return !c.lembrete_enviado_em || agora - Date.parse(c.lembrete_enviado_em) >= horas * 3600000;
}
// Hora do relógio de Brasília (o servidor roda em UTC; Brasil é UTC−3 fixo).
function horaBrasil(agora: number = Date.now()): number {
  return new Date(agora - 3 * 3600000).getUTCHours();
}
// ---- fim: ajudantes puros ----------------------------------------------------

async function enviarEmail(para: string, assunto: string, corpoHtml: string) {
  if (!/^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/.test(para)) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ destinatario: para, assunto, corpoHtml }),
    });
  } catch (e) {
    console.error('Falha ao enviar e-mail', e);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ================= ROTINA (agendador) =================
    if (action === 'rotina') {
      const segredo = req.headers.get('x-cron-secret') || '';
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
      const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const autorizado = (CRON_SECRET && segredo && iguaisSeguro(segredo, CRON_SECRET)) || (token && chaveServico && iguaisSeguro(token, chaveServico));
      if (!autorizado) return jsonResponse({ error: 'Não autorizado.' }, 401);

      const agora = Date.now();
      const { data: abertos } = await admin
        .from('chamados_suporte')
        .select('id, assunto, email, nome_solicitante, status, criado_em, respondido_em, feedback_cliente, lembrete_enviado_em, respondido_por_ia')
        .in('status', ['aberto', 'em_andamento', 'respondido_ia'])
        .order('criado_em', { ascending: true })
        .limit(500);
      const lista = (abertos || []) as (ChamadoRotina & { id: string; assunto: string; email: string; nome_solicitante: string; respondido_por_ia: boolean })[];

      // 1) Encerra o que ficou sem retorno do cliente.
      const paraFechar = lista.filter((c) => precisaFechar(c, agora, DIAS_AUTOFECHAR));
      for (const c of paraFechar) {
        await admin.from('chamados_suporte').update({ status: 'resolvido', fechado_automaticamente: true, atualizado_em: new Date().toISOString() }).eq('id', c.id);
        await enviarEmail(
          c.email,
          `Chamado #${protocoloDe(c.id)} encerrado: ${c.assunto}`,
          `<p>Olá, ${escaparHtml(c.nome_solicitante)}!</p><p>Encerramos o seu chamado <b>"${escaparHtml(c.assunto)}"</b> porque não recebemos retorno sobre a resposta automática em ${DIAS_AUTOFECHAR} dias.</p><p>Se ainda precisar de ajuda, é só abrir um novo chamado na Central de Ajuda do sistema — nossa equipe responde.</p><p>Instituto INETRIS</p>`
        );
      }

      // 2) Lembra a equipe do que está parado esperando uma pessoa.
      const paraLembrar = lista.filter((c) => precisaLembrete(c, agora, HORAS_LEMBRETE));
      if (paraLembrar.length) {
        const itens = paraLembrar
          .slice(0, 40)
          .map((c) => `<li>#${protocoloDe(c.id)} — ${escaparHtml(c.assunto)} <span style="color:#666;">(${c.status === 'aberto' ? 'aberto' : 'em andamento'}, desde ${new Date(c.criado_em).toLocaleDateString('pt-BR')})</span></li>`)
          .join('');
        await enviarEmail(EMAIL_EQUIPE, `${paraLembrar.length} chamado(s) esperando resposta há mais de ${HORAS_LEMBRETE}h`, `<p>Estes chamados de suporte estão parados esperando uma pessoa:</p><ul>${itens}</ul><p>Responda pelo painel Super Admin → Chamados de suporte.</p>`);
        await admin.from('chamados_suporte').update({ lembrete_enviado_em: new Date().toISOString() }).in('id', paraLembrar.map((c) => c.id));
      }

      // 3) Resumo diário (8h de Brasília): o que a IA respondeu nas últimas 24h, pra equipe conferir.
      let resumoEnviado = false;
      if (horaBrasil(agora) === HORA_RESUMO_BRASIL) {
        const desde = new Date(agora - 24 * 3600000).toISOString();
        const { data: porIa } = await admin.from('chamados_suporte').select('id, assunto, status, feedback_cliente').eq('respondido_por_ia', true).gte('respondido_em', desde).limit(100);
        if (porIa && porIa.length) {
          const itens = porIa
            .map((c: { id: string; assunto: string; status: string; feedback_cliente: string | null }) => `<li>#${protocoloDe(c.id)} — ${escaparHtml(c.assunto)} <span style="color:#666;">(${c.feedback_cliente === 'resolveu' ? 'cliente confirmou que resolveu' : c.feedback_cliente === 'nao_resolveu' ? 'cliente pediu atendimento humano' : 'aguardando o cliente'})</span></li>`)
            .join('');
          await enviarEmail(EMAIL_EQUIPE, `Resumo: ${porIa.length} chamado(s) respondido(s) pela IA nas últimas 24h`, `<p>A IA respondeu estes chamados sozinha. Vale conferir se as respostas estavam certas:</p><ul>${itens}</ul>`);
          resumoEnviado = true;
        }
      }
      // Marca que a rotina rodou (o painel do Super Admin mostra se está agendada).
      await admin.from('rate_limit_log').insert({ chave: 'sistema', acao: 'rotina_chamados' });
      return jsonResponse({ ok: true, fechados: paraFechar.length, lembretes: paraLembrar.length, resumoEnviado });
    }

    // ================= AÇÕES DO USUÁRIO LOGADO =================
    const auth = req.headers.get('Authorization') || '';
    const principal = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const {
      data: { user },
      error: erroAuth,
    } = await principal.auth.getUser();
    if (erroAuth || !user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: perfil } = await principal.from('perfis').select('id, empresa_id, papel').eq('id', user.id).single();
    if (!perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);

    const chamadoId = String(body?.chamadoId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chamadoId)) return jsonResponse({ error: 'Chamado inválido.' }, 400);
    const { data: chamado } = await admin
      .from('chamados_suporte')
      .select('id, empresa_id, criado_por, nome_solicitante, email, assunto, mensagem, status, resposta, ia_tentativas')
      .eq('id', chamadoId)
      .maybeSingle();
    // Só o chamado da própria empresa — e só quem abriu (ou Administrador/RH) mexe nele.
    if (!chamado || chamado.empresa_id !== perfil.empresa_id) return jsonResponse({ error: 'Chamado não encontrado.' }, 404);
    if (chamado.criado_por !== perfil.id && !['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Sem permissão para este chamado.' }, 403);

    // ---------- processar: a IA tenta responder ----------
    if (action === 'processar') {
      if (chamado.status !== 'aberto' || chamado.resposta) return jsonResponse({ ok: true, resultado: 'ja_tratado' });
      // Resposta automática por IA desligada (padrão): o chamado fica pra equipe. Só liga com ASSISTENTE_AJUDA_ATIVO=true.
      if (Deno.env.get('ASSISTENTE_AJUDA_ATIVO') !== 'true') return jsonResponse({ ok: true, resultado: 'humano', motivo: 'ia_desativada' });
      if (exigeAtendimentoHumano(chamado.assunto, chamado.mensagem)) return jsonResponse({ ok: true, resultado: 'humano', motivo: 'assunto_sensivel' });

      // Reserva a tentativa de forma atômica: nunca duas respostas automáticas pro mesmo chamado.
      const { data: reservado } = await admin.from('chamados_suporte').update({ ia_tentativas: 1 }).eq('id', chamadoId).eq('ia_tentativas', 0).select('id');
      if (!reservado || !reservado.length) return jsonResponse({ ok: true, resultado: 'ja_tratado' });

      let resposta = '';
      let sugerirChamado = true;
      try {
        const controle = new AbortController();
        const timer = setTimeout(() => controle.abort(), 40_000);
        const r = await fetch(`${url}/functions/v1/assistente-ajuda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
          body: JSON.stringify({ mensagens: [{ role: 'user', content: perguntaDoChamado(chamado.assunto, chamado.mensagem) }] }),
          signal: controle.signal,
        });
        clearTimeout(timer);
        const dados = await r.json().catch(() => ({}));
        if (r.ok && !dados.error) {
          resposta = String(dados.resposta || '').trim();
          sugerirChamado = !!dados.sugerirChamado;
        }
      } catch (e) {
        console.error('IA indisponível pro chamado', e);
      }
      // A IA não soube, ou está fora do ar: fica "aberto" pra uma pessoa (sem prejuízo ao cliente).
      if (!resposta || sugerirChamado) return jsonResponse({ ok: true, resultado: 'humano', motivo: 'ia_nao_soube' });

      const agoraIso = new Date().toISOString();
      await admin.from('chamados_suporte').update({ resposta, status: 'respondido_ia', respondido_por_ia: true, respondido_em: agoraIso, atualizado_em: agoraIso }).eq('id', chamadoId);
      await enviarEmail(
        chamado.email,
        `Resposta ao seu chamado #${protocoloDe(chamado.id)}: ${chamado.assunto}`,
        `<p>Olá, ${escaparHtml(chamado.nome_solicitante)}!</p>
         <p>Nosso assistente automático (uma inteligência artificial) respondeu o seu chamado <b>"${escaparHtml(chamado.assunto)}"</b>:</p>
         <blockquote style="border-left:3px solid #ccc;margin:12px 0;padding:4px 12px;">${escaparHtml(resposta).replace(/\n/g, '<br>')}</blockquote>
         <p><b>Isso resolveu?</b> Abra a Central de Ajuda no sistema e clique em <b>"Resolveu"</b> ou <b>"Ainda preciso de ajuda"</b> — se ainda precisar, nossa equipe assume o chamado. Sem retorno, ele é encerrado em ${DIAS_AUTOFECHAR} dias.</p>
         <p>Protocolo: <b>#${protocoloDe(chamado.id)}</b></p><p>Instituto INETRIS</p>`
      );
      return jsonResponse({ ok: true, resultado: 'ia', resposta });
    }

    // ---------- feedback: o cliente diz se resolveu ----------
    if (action === 'feedback') {
      if (chamado.status !== 'respondido_ia') return jsonResponse({ ok: true, resultado: 'ja_tratado' });
      const resolveu = body?.resolveu === true;
      const agoraIso = new Date().toISOString();
      if (resolveu) {
        await admin.from('chamados_suporte').update({ status: 'resolvido', feedback_cliente: 'resolveu', atualizado_em: agoraIso }).eq('id', chamadoId);
        return jsonResponse({ ok: true, resultado: 'resolvido' });
      }
      // Não resolveu: a equipe assume, e é avisada na hora.
      await admin.from('chamados_suporte').update({ status: 'em_andamento', feedback_cliente: 'nao_resolveu', atualizado_em: agoraIso }).eq('id', chamadoId);
      await enviarEmail(
        EMAIL_EQUIPE,
        `Cliente pediu atendimento humano — chamado #${protocoloDe(chamado.id)}`,
        `<p><b>${escaparHtml(chamado.nome_solicitante)}</b> (${escaparHtml(chamado.email)}) disse que a resposta automática <b>não resolveu</b>.</p>
         <p><b>Chamado:</b> ${escaparHtml(chamado.assunto)}</p><p>${escaparHtml(chamado.mensagem).replace(/\n/g, '<br>')}</p>
         <p><b>Resposta automática dada:</b></p><blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;">${escaparHtml(chamado.resposta).replace(/\n/g, '<br>')}</blockquote>
         <p>Responda pelo painel Super Admin → Chamados de suporte.</p>`
      );
      return jsonResponse({ ok: true, resultado: 'equipe' });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função chamado-automatico:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode sql/38-ajuda-automatica.sql.
// 2) Supabase > Edge Functions > New Function > nome exato: chamado-automatico >
//    cole este código > Deploy. DESLIGUE "Verify JWT" (a função se autentica sozinha).
// 3) Secrets da função: CRON_SECRET (texto longo e aleatório, o mesmo do
//    agendamento) e, se quiser outro e-mail pra equipe, EMAIL_EQUIPE.
// 4) Precisa das funções "assistente-ajuda" e "enviar-email" já implantadas.
// 5) Agendar a rotina: veja o final do sql/38-ajuda-automatica.sql.
// =========================================================================
