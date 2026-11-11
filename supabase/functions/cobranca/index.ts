// =========================================================================
// INETRIS — Edge Function "cobranca" (modelo por LINK de pagamento)
// =========================================================================
// O teste grátis continua SEM cartão. No fim dos 7 dias a pessoa recebe o link de pagamento do plano dela (mensalidade mais
// implantação, sem fidelidade) e PAGA se quiser continuar. Nada é cobrado sem a pessoa pagar por conta própria.
//
// Esta função atende o sistema (quem está logado) e o Super Admin:
//   resumo               a assinatura da minha empresa e, na hora certa, o link de pagamento do meu plano (Administrador);
//   escolher_plano       registra o plano escolhido e o ACEITE (o texto exato que a pessoa viu, gerado AQUI, nunca pelo navegador);
//   cancelar             cancela a assinatura (Administrador);
//   confirmar_pagamento  o Super Admin confirma que o pagamento caiu: a assinatura fica ativa e a empresa vira "pagante".
// Só o servidor escreve na assinatura (o navegador nunca grava direto: ver sql/46-cobranca.sql).
//
// Só funciona com o segredo COBRANCA_ATIVA = true. Sem ele, "resumo" responde { ativa: false } e as outras ações recusam.
//
// COMO IMPLANTAR
// 1) Supabase, Edge Functions, "cobranca". Aqui o "Verify JWT" fica LIGADO (é uma função de quem está logado).
// 2) Antes: rode o sql/46-cobranca.sql e carregue os links de pagamento (tabela links_pagamento).
// 3) Para ligar: Secrets, COBRANCA_ATIVA = true (e, no site, cobrancaAtiva: true no ambiente.js).
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

// ---- LÓGICA DA COBRANÇA (a parte pura: testada, sem rede nem banco) ----------------------------
const VERSAO_ACEITE = 'v1';
const WHATSAPP_SUPORTE = '558999857062'; // o MESMO número das outras funções e da tela de entrada
const DIAS_DA_JANELA_DO_LINK = 3; // o link aparece (e é avisado por e-mail) a partir de 3 dias antes do fim do teste
// Valores em CENTAVOS (inteiros: nunca dinheiro em número com vírgula). Sem fidelidade: a mensalidade é uma só.
const PLANOS = [
  { chave: 'essencial', nome: 'Essencial', ate: 10, detalhe: 'Até 10 colaboradores', mensalidade: 29700, implantacao: 59000 },
  { chave: 'gestao', nome: 'Gestão', ate: 30, detalhe: '11 a 30 colaboradores', mensalidade: 59700, implantacao: 99000 },
  { chave: 'estrategico', nome: 'Estratégico', ate: 60, detalhe: '31 a 60 colaboradores', mensalidade: 99700, implantacao: 149000 },
];

function planoPorChave(chave: unknown) {
  return PLANOS.find((p) => p.chave === chave) || null;
}
// O plano que comporta esta quantidade de colaboradores (acima de 60 não há plano de tabela: proposta personalizada).
function planoParaColaboradores(n: number) {
  if (!Number.isFinite(n) || n < 1) return null;
  return PLANOS.find((p) => n <= p.ate) || null;
}
function valoresDoPlano(p: { mensalidade: number; implantacao: number }) {
  return { mensalidade: p.mensalidade, implantacao: p.implantacao, total: p.mensalidade + p.implantacao };
}
function formatarReais(centavos: number): string {
  const c = Math.round(Number(centavos) || 0);
  const reais = Math.floor(c / 100);
  const cent = c % 100;
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(cent).padStart(2, '0')}`;
}
// A data (AAAA-MM-DD) no horário de Brasília, de um instante qualquer.
function dataBrasilDe(iso: unknown): string | null {
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function formatarDataBR(iso: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = ateISO.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}
// Um mês depois, no mesmo dia (31 de janeiro vira 28 ou 29 de fevereiro).
function somarUmMes(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const ano = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
// O texto que a pessoa vê e aceita. Fica guardado inteiro: é a prova do que foi combinado.
function textoDoAceite(p: { nome: string; detalhe: string; mensalidade: number; implantacao: number }, dataISO: string): string {
  const v = valoresDoPlano(p);
  return (
    `Plano ${p.nome} (${p.detalhe.toLowerCase()}): mensalidade de ${formatarReais(v.mensalidade)}, sem fidelidade, e implantação de ${formatarReais(v.implantacao)} (cobrada uma única vez). ` +
    `Seu teste grátis termina em ${formatarDataBR(dataISO)}. Nessa data você receberá o link para pagar ${formatarReais(v.total)} (implantação e primeira mensalidade) pelo cartão. ` +
    'Nada é cobrado automaticamente: o acesso continua se você pagar e, se não pagar, o acesso é pausado e seus dados ficam guardados. Você pode cancelar quando quiser.'
  );
}
// Quem pode trocar de plano: ainda não pagou (ou cancelou e voltou).
function podeEscolherPlano(status: string | null): boolean {
  return status === null || status === 'agendada' || status === 'aguardando_pagamento' || status === 'cancelada';
}
function podeCancelar(status: string): boolean {
  return status !== 'cancelada';
}
function podeConfirmarPagamento(status: string): boolean {
  return status === 'agendada' || status === 'aguardando_pagamento' || status === 'em_atraso' || status === 'suspensa';
}
// Na data do fim do teste (ou depois), a assinatura passa a aguardar o pagamento.
function statusParaData(dataCobrancaISO: string, hojeISO: string): string {
  return hojeISO >= dataCobrancaISO ? 'aguardando_pagamento' : 'agendada';
}
// O link só aparece perto do fim do teste, ou depois dele (nunca no primeiro dia).
function janelaDoLink(status: string, dataCobrancaISO: string, hojeISO: string): boolean {
  if (status === 'aguardando_pagamento' || status === 'em_atraso' || status === 'suspensa') return true;
  if (status === 'agendada') return diasEntre(hojeISO, dataCobrancaISO) <= DIAS_DA_JANELA_DO_LINK;
  return false;
}
function montarResumo(a: Record<string, any>, link: string | null, hojeISO: string) {
  const p = planoPorChave(a.plano);
  const janela = janelaDoLink(a.status, a.primeira_cobranca_em, hojeISO);
  return {
    status: a.status,
    plano: { chave: a.plano, nome: p ? p.nome : a.plano, detalhe: p ? p.detalhe : '' },
    mensalidade: formatarReais(a.mensalidade_centavos),
    implantacao: formatarReais(a.implantacao_centavos),
    total: formatarReais(a.primeira_cobranca_centavos),
    primeiraCobrancaEm: a.primeira_cobranca_em,
    primeiraCobrancaEmBR: formatarDataBR(a.primeira_cobranca_em),
    diasParaCobranca: diasEntre(hojeISO, a.primeira_cobranca_em),
    link: janela ? link : null,
    linkIndisponivel: janela && !link && a.status !== 'cancelada',
    whatsapp: `https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent('Olá! Tenho uma dúvida sobre o pagamento do INETRIS.')}`,
    podeTrocarPlano: podeEscolherPlano(a.status),
    podeCancelar: podeCancelar(a.status),
    aceiteEm: a.aceite_em,
    aceiteTexto: a.aceite_texto,
    pagoEm: a.pago_em || null,
    canceladaEm: a.cancelada_em || null,
    proximaCobrancaEm: a.proxima_cobranca_em || null,
  };
}
function listaDePlanos() {
  return PLANOS.map((p) => {
    const v = valoresDoPlano(p);
    return {
      chave: p.chave,
      nome: p.nome,
      detalhe: p.detalhe,
      ate: p.ate,
      mensalidade: formatarReais(v.mensalidade),
      implantacao: formatarReais(v.implantacao),
      total: formatarReais(v.total),
    };
  });
}
// ---- fim: lógica da cobrança ----------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Banco = any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function linkDoPlano(admin: Banco, plano: string): Promise<string | null> {
  const { data } = await admin.from('links_pagamento').select('url').eq('plano', plano).eq('tipo', 'primeira').maybeSingle();
  return data && typeof data.url === 'string' ? data.url : null;
}
async function resumoDaEmpresa(admin: Banco, empresaId: string, hojeISO: string) {
  const { data: a } = await admin.from('assinaturas').select('*').eq('empresa_id', empresaId).maybeSingle();
  if (!a) return null;
  const janela = janelaDoLink(a.status, a.primeira_cobranca_em, hojeISO);
  const link = janela ? await linkDoPlano(admin, a.plano) : null;
  return montarResumo(a, link, hojeISO);
}
async function registrarEvento(admin: Banco, empresaId: string, tipo: string, chave: string, detalhes: Record<string, unknown>) {
  const { error } = await admin.from('assinaturas_eventos').insert({ empresa_id: empresaId, tipo, chave, detalhes });
  if (error && !/duplicate|unique/i.test(String(error.message))) console.error('Falha ao registrar evento de cobrança:', error.message);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (Deno.env.get('COBRANCA_ATIVA') !== 'true') {
      // desligada: o "resumo" diz isso (o site esconde tudo) e as demais ações recusam
      let acao = '';
      try {
        acao = String((await req.json())?.action || '');
      } catch (_) {
        /* corpo vazio */
      }
      return acao === 'resumo' ? jsonResponse({ ativa: false }) : jsonResponse({ error: 'A cobrança ainda não está ativa.' }, 403);
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch (_) {
      return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
    }
    const action = String(body?.action || '');

    // ---- Quem está chamando? (a sessão de quem está logado) ----
    const auth = req.headers.get('Authorization') || '';
    const principal = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const {
      data: { user },
    } = await principal.auth.getUser();
    if (!user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const agoraISO = new Date().toISOString();
    const hojeISO = dataBrasilDe(agoraISO) as string;

    // ---- Ação do Super Admin ----
    if (action === 'confirmar_pagamento') {
      const { data: sa } = await admin.from('super_admins').select('id').eq('id', user.id).maybeSingle();
      if (!sa) return jsonResponse({ error: 'Só o Super Admin confirma pagamentos.' }, 403);
      const empresaId = String(body?.empresa_id || '');
      if (!UUID.test(empresaId)) return jsonResponse({ error: 'empresa_id inválido.' }, 400);
      const { data: a } = await admin.from('assinaturas').select('status').eq('empresa_id', empresaId).maybeSingle();
      if (!a) return jsonResponse({ error: 'Esta empresa não tem assinatura.' }, 404);
      if (!podeConfirmarPagamento(a.status)) return jsonResponse({ error: `Não dá para confirmar pagamento de uma assinatura "${a.status}".` }, 409);
      const { error: erroA } = await admin
        .from('assinaturas')
        .update({ status: 'ativa', pago_em: agoraISO, pago_confirmado_por: user.id, ultima_cobranca_em: hojeISO, proxima_cobranca_em: somarUmMes(hojeISO) })
        .eq('empresa_id', empresaId);
      if (erroA) return jsonResponse({ error: erroA.message }, 500);
      // a empresa passa a ser cliente: o bloqueio do fim do teste deixa de valer
      const { error: erroE } = await admin.from('empresas').update({ is_pagante: true, acesso_suspenso: false }).eq('id', empresaId);
      if (erroE) return jsonResponse({ error: `Pagamento registrado, mas não consegui liberar a empresa: ${erroE.message}` }, 500);
      await registrarEvento(admin, empresaId, 'pagamento_confirmado', agoraISO, { por: user.id, dia: hojeISO });
      return jsonResponse({ ok: true, resumo: await resumoDaEmpresa(admin, empresaId, hojeISO) });
    }

    // ---- Ações do Administrador da empresa ----
    const { data: perfil } = await admin.from('perfis').select('id, empresa_id, papel, desativado').eq('id', user.id).maybeSingle();
    if (!perfil || perfil.desativado) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);
    if (perfil.papel !== 'owner') return jsonResponse({ error: 'Só o Administrador da empresa vê e altera a cobrança.' }, 403);
    const empresaId = perfil.empresa_id as string;

    if (action === 'resumo') {
      const { data: empresa } = await admin.from('empresas').select('trial_ate, is_pagante').eq('id', empresaId).maybeSingle();
      return jsonResponse({
        ativa: true,
        assinatura: await resumoDaEmpresa(admin, empresaId, hojeISO),
        planos: listaDePlanos(),
        trialAte: empresa && empresa.trial_ate ? dataBrasilDe(empresa.trial_ate) : null,
        ehPagante: !!(empresa && empresa.is_pagante),
      });
    }

    if (action === 'escolher_plano') {
      const plano = planoPorChave(body?.plano);
      if (!plano) return jsonResponse({ error: 'Plano inválido.' }, 400);
      const { data: empresa } = await admin.from('empresas').select('trial_ate, is_pagante').eq('id', empresaId).maybeSingle();
      if (!empresa) return jsonResponse({ error: 'Empresa não encontrada.' }, 404);
      if (empresa.is_pagante) return jsonResponse({ error: 'Esta empresa já é cliente.' }, 409);
      if (!empresa.trial_ate) return jsonResponse({ error: 'Esta empresa não está em teste grátis.' }, 400);
      const { data: existente } = await admin.from('assinaturas').select('status').eq('empresa_id', empresaId).maybeSingle();
      if (!podeEscolherPlano(existente ? existente.status : null)) return jsonResponse({ error: 'O plano não pode mais ser trocado por aqui. Fale com a gente.' }, 409);
      const fimDoTeste = dataBrasilDe(empresa.trial_ate) as string;
      const dataCobranca = fimDoTeste > hojeISO ? fimDoTeste : hojeISO;
      const v = valoresDoPlano(plano);
      const { error: erro } = await admin.from('assinaturas').upsert(
        {
          empresa_id: empresaId,
          plano: plano.chave,
          mensalidade_centavos: v.mensalidade,
          implantacao_centavos: v.implantacao,
          primeira_cobranca_centavos: v.total,
          primeira_cobranca_em: dataCobranca,
          status: statusParaData(dataCobranca, hojeISO),
          aceite_em: agoraISO,
          aceite_por: user.id,
          aceite_versao: VERSAO_ACEITE,
          aceite_texto: textoDoAceite(plano, dataCobranca),
          cancelada_em: null,
          cancelada_por: null,
          motivo_cancelamento: null,
        },
        { onConflict: 'empresa_id' }
      );
      if (erro) return jsonResponse({ error: erro.message }, 500);
      await registrarEvento(admin, empresaId, 'plano_escolhido', agoraISO, { plano: plano.chave, total: v.total, data: dataCobranca, versao: VERSAO_ACEITE, por: user.id });
      return jsonResponse({ ok: true, resumo: await resumoDaEmpresa(admin, empresaId, hojeISO) });
    }

    if (action === 'cancelar') {
      const { data: a } = await admin.from('assinaturas').select('status').eq('empresa_id', empresaId).maybeSingle();
      if (!a) return jsonResponse({ error: 'Não há assinatura para cancelar.' }, 404);
      if (podeCancelar(a.status)) {
        const motivo = String(body?.motivo || '').trim().slice(0, 300) || null;
        const { error } = await admin.from('assinaturas').update({ status: 'cancelada', cancelada_em: agoraISO, cancelada_por: user.id, motivo_cancelamento: motivo }).eq('empresa_id', empresaId);
        if (error) return jsonResponse({ error: error.message }, 500);
        await registrarEvento(admin, empresaId, 'cancelada', agoraISO, { por: user.id, estava: a.status });
      }
      return jsonResponse({ ok: true, resumo: await resumoDaEmpresa(admin, empresaId, hojeISO) });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função cobranca:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});
