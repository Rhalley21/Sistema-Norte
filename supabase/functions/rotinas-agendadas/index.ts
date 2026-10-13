// =========================================================================
// NORTE — Edge Function "rotinas-agendadas"
// =========================================================================
// Rotina que roda SOZINHA todo dia (8h de Brasília), chamada pelo agendador do
// Supabase (pg_cron). Antes, estas coisas só aconteciam quando alguém abria uma
// tela — justamente quando mais precisavam rodar sozinhas:
//
//   1) Lembretes de prazo das avaliações — e-mail pra QUEM ESTÁ COM A AVALIAÇÃO
//      PENDENTE, 5 dias antes, 2 dias antes e no dia do prazo (D-5, D-2, D-0).
//   2) Escalonamento de justificativas do Ponto paradas há 3+ dias — sobe pro
//      substituto do gestor e pro RH, mesmo que ninguém abra a tela de conferência.
//   3) Prazo do banco de talentos (24 meses): remove quem passou do prazo, mesmo
//      que ninguém abra a tela (é uma promessa feita ao candidato — LGPD).
//   4) Fim do teste grátis — e-mail ao Administrador 2 dias antes, no último dia e
//      depois (1 e 7 dias após o fim), e um resumo diário pra equipe acompanhar.
//   5) Campanhas do NR1 vencidas — encerra no dia seguinte à data final e avisa o
//      Administrador e o RH (antes só fechava quando alguém chamava a função).
//   6) Provas do processo seletivo (R&S): link que venceu sem o candidato começar vira "expirada", e
//      resultados com mais de 24 meses são apagados (prazo informado na Política de Privacidade).
//   7) Limpeza do rate_limit_log (registros com mais de 35 dias).
//
// Também registra "quando rodou" pra o painel do Super Admin mostrar se a rotina
// está de fato agendada. Se alguma tarefa falhar, a equipe recebe um e-mail.
//
// Esta função NUNCA altera os dados da empresa (dados_sistema): só lê. Escrever ali
// do servidor poderia sobrescrever o que alguém estivesse editando na tela.
//
// Autenticação: segredo do agendador (CRON_SECRET) ou chave de serviço. A ação
// "status" é do Super Admin logado. Por isso "Verify JWT" fica DESLIGADO.
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
// Site (onde ficam os planos) e WhatsApp comercial — usados nos e-mails de fim de teste.
const URL_SITE = (Deno.env.get('URL_SITE') || 'https://rhalley21.github.io/testes/').replace(/\/?$/, '/');
const LINKS_TESTE = {
  planos: `${URL_SITE}index.html#planos`,
  whatsapp: 'https://wa.me/558999857062?text=Ol%C3%A1!%20Quero%20continuar%20usando%20o%20INETRIS.',
};

// Mesmo número do texto do formulário de candidatura, da Política de Privacidade e da função "rs" — um teste confere.
const BANCO_TALENTOS_MESES = 24;
// Quanto tempo ficam os resultados das provas aplicadas a candidatos — o MESMO número da função provas-rs, da Política de Privacidade e da documentação.
const PROVAS_RETENCAO_MESES = 24;
// Lembretes: quantos dias antes do prazo (0 = no dia). Mesmo que o aviso na tela diz: "D-5, D-2 e D-0".
const DIAS_LEMBRETE = [5, 2, 0];
const DIAS_RETENCAO_LOG = 35; // cobre as janelas de 30 dias dos limites de uso
// Teste grátis: dias em relação ao FIM do teste em que o Administrador recebe e-mail
// (positivo = faltam N dias; 0 = último dia; negativo = já terminou há N dias).
const TRIAL_DIAS_AVISO = [2, 0, -1, -7];

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
// Data de hoje no Brasil (AAAA-MM-DD). O servidor roda em UTC; o Brasil é UTC−3 fixo.
function hojeBrasilISO(agora: number = Date.now()): string {
  return new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
}
function mesesAtras(agora: number, meses: number): string {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString();
}
function diasAtras(agora: number, dias: number): string {
  return new Date(agora - dias * 86400000).toISOString();
}

// Dias entre hoje e o prazo (ambos AAAA-MM-DD). Negativo = já venceu. null se a data for inválida.
function diasAteOPrazo(prazoISO: unknown, hojeISO: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(prazoISO || ''));
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hojeISO);
  if (!m || !h) return null;
  const prazo = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = Date.UTC(Number(h[1]), Number(h[2]) - 1, Number(h[3]));
  if (Number.isNaN(prazo) || Number.isNaN(hoje)) return null;
  return Math.round((prazo - hoje) / 86400000);
}

type Ciclo = { id?: string; colaboradorId?: string; estado?: string; etapa?: string; prazoLimite?: string; tipoAvaliacao?: string };
const ETAPAS_VALIDAS = ['colaborador', 'lider', 'rh'];

// Esse ciclo precisa de lembrete HOJE? Só avaliação assíncrona ainda em andamento (a mesma regra do
// aviso na tela), com prazo daqui a 5, 2 ou 0 dias. Devolve em que etapa está e quantos dias faltam.
function cicloPrecisaLembrete(c: Ciclo, hojeISO: string): { dias: number; etapa: string } | null {
  if (!c || !c.id || !c.colaboradorId) return null;
  if (c.estado !== 'Aberto' && c.estado !== 'Em Consolidação') return null;
  if (c.tipoAvaliacao === 'ao_vivo') return null; // sessão presencial: não tem "etapa do avaliador"
  const dias = diasAteOPrazo(c.prazoLimite, hojeISO);
  if (dias === null || !DIAS_LEMBRETE.includes(dias)) return null;
  const etapa = ETAPAS_VALIDAS.includes(String(c.etapa)) ? String(c.etapa) : 'colaborador';
  return { dias, etapa };
}

// Empresa suspensa, ou com teste grátis vencido e sem ter virado cliente, não recebe e-mail automático.
function empresaRecebeEmail(e: { acesso_suspenso?: boolean; trial_ate?: string | null; is_pagante?: boolean } | null | undefined, agora: number): boolean {
  if (!e || e.acesso_suspenso) return false;
  if (e.trial_ate && !e.is_pagante && new Date(e.trial_ate).getTime() < agora) return false;
  return true;
}
// A empresa pode desligar os lembretes em Configurações (mesma chave que a tela respeita).
function lembretesLigados(config: { notificacoes?: { lembretesPrazo?: boolean } } | null | undefined): boolean {
  return config?.notificacoes?.lembretesPrazo !== false;
}
// Chave que impede o MESMO lembrete de sair duas vezes (rodar a rotina duas vezes no dia não duplica e-mail).
function chaveLembrete(cicloId: string, etapa: string, dias: number): string {
  return `lembrete:${cicloId}:${etapa}:D${dias}`;
}
function quandoVence(dias: number): string {
  return dias === 0 ? 'vence hoje' : `vence em ${dias} dia${dias === 1 ? '' : 's'}`;
}
const TEXTO_ETAPA: Record<string, string> = { colaborador: 'sua autoavaliação', lider: 'sua avaliação como líder direto', rh: 'a avaliação do RH' };
function corpoLembrete(nomeColaborador: string, etapa: string, dias: number, prazoISO: string): string {
  const [a, m, d] = String(prazoISO).slice(0, 10).split('-');
  return `<p>Olá!</p>
<p>A avaliação de <b>${escaparHtml(nomeColaborador)}</b> <b>${quandoVence(dias)}</b> (prazo: ${d}/${m}/${a}) e está esperando ${TEXTO_ETAPA[etapa] || 'a sua avaliação'}.</p>
<p>Entre na Plataforma NORTE → <b>Ciclos de Avaliação</b> para concluir.</p>
<p>Instituto INETRIS</p>`;
}

// ---- Teste grátis ----
// Dia (AAAA-MM-DD) do calendário de Brasília em que um instante cai.
function diaBrasilDe(iso: unknown): string | null {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? null : new Date(t - 3 * 3600000).toISOString().slice(0, 10);
}
function diasParaFimDoTeste(trialAte: unknown, hojeISO: string): number | null {
  const dia = diaBrasilDe(trialAte);
  return dia ? diasAteOPrazo(dia, hojeISO) : null;
}
type EmpresaTeste = { id?: string; nome_fantasia?: string; trial_ate?: string | null; is_pagante?: boolean; acesso_suspenso?: boolean };
// Esta empresa deve receber o e-mail de teste HOJE? Só quem está em teste (trial_ate), ainda não virou
// cliente e não foi suspensa, e cujo fim cai num dos dias de aviso. Devolve quantos dias faltam (ou passaram).
function avisoDoTeste(e: EmpresaTeste | null | undefined, hojeISO: string): number | null {
  if (!e || !e.trial_ate || e.is_pagante || e.acesso_suspenso) return null;
  const dias = diasParaFimDoTeste(e.trial_ate, hojeISO);
  return dias !== null && TRIAL_DIAS_AVISO.includes(dias) ? dias : null;
}
function chaveTrial(empresaId: string, dias: number): string {
  return `trial:${empresaId}:D${dias}`;
}
function assuntoTrial(dias: number): string {
  if (dias === 2) return 'Seu teste grátis do INETRIS termina em 2 dias';
  if (dias === 0) return 'Hoje é o último dia do seu teste grátis do INETRIS';
  if (dias === -1) return 'Seu teste grátis terminou — seus dados estão guardados';
  return 'Quer continuar de onde parou no INETRIS?';
}
function quandoTesteAcaba(dias: number): string {
  if (dias > 0) return `termina em ${dias} dia${dias === 1 ? '' : 's'}`;
  if (dias === 0) return 'termina hoje';
  return `terminou há ${-dias} dia${dias === -1 ? '' : 's'}`;
}
function corpoTrial(dias: number, nomePessoa: string, nomeEmpresa: string, fimISO: string | null, links: { planos: string; whatsapp: string }): string {
  const [a, m, d] = String(fimISO || '').split('-');
  const fim = a ? `${d}/${m}/${a}` : '';
  const empresa = `<b>${escaparHtml(nomeEmpresa)}</b>`;
  const principal =
    dias === 2
      ? `O teste grátis de ${empresa} termina em <b>${fim}</b> (daqui a 2 dias). Aproveite para explorar os módulos — tudo o que você cadastrar fica guardado.`
      : dias === 0
        ? `Hoje é o último dia do teste grátis de ${empresa}. Depois dele o acesso é pausado, mas <b>nada do que você cadastrou é apagado</b>.`
        : dias === -1
          ? `O teste grátis de ${empresa} terminou e o acesso foi pausado. <b>Seus dados continuam guardados</b>: o acesso volta assim que você escolher um plano.`
          : `Faz uma semana que o teste grátis de ${empresa} terminou. Seus dados continuam guardados e o acesso volta assim que você escolher um plano — sem cadastrar nada de novo.`;
  return `<p>Olá, ${escaparHtml(nomePessoa || '')}!</p>
<p>${principal}</p>
<p>Para continuar sem perder nada: <a href="${links.whatsapp}">fale com a gente no WhatsApp</a> ou <a href="${links.planos}">veja os planos</a>.</p>
<p>Instituto INETRIS</p>`;
}

// ---- NR1 ----
function corpoNr1Encerrada(nomeCampanha: string, dataFimISO: string): string {
  const [a, m, d] = String(dataFimISO).slice(0, 10).split('-');
  return `<p>Olá!</p>
<p>A campanha NR1 <b>${escaparHtml(nomeCampanha)}</b> chegou ao fim em ${d}/${m}/${a} e foi <b>encerrada automaticamente</b>.</p>
<p>Abra <b>NR1 — Riscos Psicossociais</b> para ver o resultado consolidado e gerar o relatório. Para preservar o anonimato, os resultados só aparecem para grupos com o número mínimo de respondentes definido na campanha.</p>
<p>Instituto INETRIS</p>`;
}
// ---- fim: ajudantes puros ----------------------------------------------------

async function enviarEmail(para: string, assunto: string, corpoHtml: string): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ destinatario: para, assunto, corpoHtml }),
    });
    return r.ok;
  } catch (e) {
    console.error('Falha ao enviar e-mail', e);
    return false;
  }
}


// ---- Tarefas (recebem o banco e o envio de e-mail — por isso dá pra testar o comportamento) ----
// deno-lint-ignore no-explicit-any
type Banco = any;
type Enviar = (para: string, assunto: string, corpoHtml: string) => Promise<boolean>;

async function jaRegistrado(admin: Banco, chave: string, acao: string, agora: number, dias = 1.5): Promise<boolean> {
  const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', acao).gte('criado_em', diasAtras(agora, dias));
  return (count || 0) > 0;
}

// 1) Lembretes de prazo das avaliações.
async function lembretesDeCiclos(admin: Banco, enviar: Enviar, agora: number) {
  const hojeISO = hojeBrasilISO(agora);
  const { data: empresas } = await admin.from('empresas').select('id, acesso_suspenso, trial_ate, is_pagante').limit(5000);
  const ativas = new Set((empresas || []).filter((e: EmpresaTeste) => empresaRecebeEmail(e, agora)).map((e: { id: string }) => e.id));
  // Só o que precisa do blob (ciclos, colaboradores, configurações) — e SÓ LEITURA.
  const { data: dados, error } = await admin.from('dados_sistema').select('empresa_id, ciclos:payload->ciclos, colaboradores:payload->colaboradores, config:payload->configuracoes').limit(5000);
  if (error) throw new Error(error.message);
  let enviados = 0;
  let jaEnviados = 0;
  for (const linha of dados || []) {
    if (!ativas.has(linha.empresa_id) || !lembretesLigados(linha.config)) continue;
    const colaboradores = Array.isArray(linha.colaboradores) ? linha.colaboradores : [];
    const ciclos: Ciclo[] = Array.isArray(linha.ciclos) ? linha.ciclos : [];
    let rhDaEmpresa: { id: string; email: string | null }[] | null = null; // buscado só se precisar
    for (const c of ciclos) {
      const alvo = cicloPrecisaLembrete(c, hojeISO);
      if (!alvo) continue;
      const colaborador = colaboradores.find((x: { id: string }) => x.id === c.colaboradorId);
      if (!colaborador) continue;
      const chave = chaveLembrete(c.id!, alvo.etapa, alvo.dias);
      if (await jaRegistrado(admin, chave, 'lembrete_ciclo', agora)) {
        jaEnviados++;
        continue;
      }
      // De quem é a vez (mesma regra do aviso "avaliação pendente" da tela).
      let perfis: { id: string; email: string | null; desativado?: boolean }[] = [];
      if (alvo.etapa === 'rh') {
        if (!rhDaEmpresa) {
          const { data: rhs } = await admin.from('perfis').select('id, email').eq('empresa_id', linha.empresa_id).eq('papel', 'rh').eq('desativado', false);
          rhDaEmpresa = rhs || [];
        }
        perfis = rhDaEmpresa;
      } else {
        const idAlvo = alvo.etapa === 'lider' ? colaborador.gestorPerfilId : colaborador.perfilId;
        if (!idAlvo) continue;
        const { data: p } = await admin.from('perfis').select('id, email, desativado').eq('id', idAlvo).maybeSingle();
        if (p && !p.desativado) perfis = [p];
      }
      let algumEnviado = false;
      for (const p of perfis) {
        if (!p.email) continue;
        const ok = await enviar(p.email, `Lembrete — avaliação de ${colaborador.nome} ${quandoVence(alvo.dias)}`, corpoLembrete(colaborador.nome, alvo.etapa, alvo.dias, String(c.prazoLimite)));
        if (ok) {
          algumEnviado = true;
          enviados++;
        }
      }
      // Só marca como enviado se pelo menos um e-mail saiu — senão tenta de novo na próxima execução.
      if (algumEnviado) await admin.from('rate_limit_log').insert({ chave, acao: 'lembrete_ciclo' });
    }
  }
  return { enviados, jaEnviados };
}

// 4) Fim do teste grátis: e-mail ao Administrador + resumo diário pra equipe.
async function avisosDoTeste(admin: Banco, enviar: Enviar, agora: number, links: { planos: string; whatsapp: string }, emailEquipe: string) {
  const hojeISO = hojeBrasilISO(agora);
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, nome_fantasia, trial_ate, is_pagante, acesso_suspenso')
    .not('trial_ate', 'is', null)
    .gte('trial_ate', diasAtras(agora, 9)) // o último aviso é 7 dias depois do fim
    .limit(2000);
  if (error) throw new Error(error.message);
  const candidatas: { e: EmpresaTeste & { id: string }; dias: number }[] = [];
  for (const e of empresas || []) {
    const dias = avisoDoTeste(e, hojeISO);
    if (dias !== null) candidatas.push({ e, dias });
  }
  if (!candidatas.length) return { enviados: 0, jaEnviados: 0, resumoEnviado: false };

  const { data: donos } = await admin.from('perfis').select('id, empresa_id, nome, email').in('empresa_id', candidatas.map((c) => c.e.id)).eq('papel', 'owner').eq('desativado', false);
  let enviados = 0;
  let jaEnviados = 0;
  const resumo: { empresa: string; dias: number; contatos: string[] }[] = [];
  for (const { e, dias } of candidatas) {
    const donosDaEmpresa = (donos || []).filter((d: { empresa_id: string; email: string | null }) => d.empresa_id === e.id && d.email);
    resumo.push({ empresa: e.nome_fantasia || '(sem nome)', dias, contatos: donosDaEmpresa.map((d: { nome: string; email: string }) => `${d.nome || 'sem nome'} <${d.email}>`) });
    const chave = chaveTrial(e.id, dias);
    if (await jaRegistrado(admin, chave, 'trial_aviso', agora)) {
      jaEnviados++;
      continue;
    }
    let algum = false;
    for (const d of donosDaEmpresa) {
      const ok = await enviar(d.email, assuntoTrial(dias), corpoTrial(dias, d.nome, e.nome_fantasia || 'sua empresa', diaBrasilDe(e.trial_ate), links));
      if (ok) {
        algum = true;
        enviados++;
      }
    }
    if (algum) await admin.from('rate_limit_log').insert({ chave, acao: 'trial_aviso' });
  }

  // Resumo pra equipe (vendas): UM por dia, com quem está perto do fim do teste e como falar com eles.
  let resumoEnviado = false;
  const chaveResumo = `trial-resumo:${hojeISO}`;
  if (resumo.length && !(await jaRegistrado(admin, chaveResumo, 'trial_resumo', agora))) {
    const itens = resumo
      .sort((a, b) => b.dias - a.dias)
      .map((r) => `<li><b>${escaparHtml(r.empresa)}</b> — ${quandoTesteAcaba(r.dias)}<br><span style="color:#666;">${r.contatos.length ? r.contatos.map(escaparHtml).join(' · ') : 'sem e-mail de Administrador cadastrado'}</span></li>`)
      .join('');
    resumoEnviado = await enviar(emailEquipe, `Testes grátis para acompanhar hoje (${resumo.length})`, `<p>Empresas em teste que estão perto do fim (ou acabaram de terminar) e ainda não viraram clientes — bom momento para o contato:</p><ul>${itens}</ul>`);
    if (resumoEnviado) await admin.from('rate_limit_log').insert({ chave: chaveResumo, acao: 'trial_resumo' });
  }
  return { enviados, jaEnviados, resumoEnviado };
}

// 5) Campanhas do NR1 vencidas: encerra (de forma atômica) e avisa o Administrador e o RH.
async function encerrarCampanhasNr1(admin: Banco, enviar: Enviar, agora: number) {
  const hoje = hojeBrasilISO(agora); // a data final é INCLUSIVA: só encerra a partir do dia seguinte
  const { data: fechadas, error } = await admin
    .from('nr1_campanhas')
    .update({ status: 'encerrada', encerrada_em: new Date(agora).toISOString(), auto_encerrada: true })
    .eq('status', 'ativa')
    .lt('data_fim', hoje)
    .select('id, empresa_id, nome, data_fim');
  if (error) throw new Error(error.message);
  if (!fechadas || !fechadas.length) return { encerradas: 0, avisos: 0 };

  const ids = [...new Set(fechadas.map((c: { empresa_id: string }) => c.empresa_id))];
  const { data: empresas } = await admin.from('empresas').select('id, acesso_suspenso, trial_ate, is_pagante').in('id', ids);
  const podeReceber = new Set((empresas || []).filter((e: EmpresaTeste) => empresaRecebeEmail(e, agora)).map((e: { id: string }) => e.id));
  const { data: gestores } = await admin.from('perfis').select('empresa_id, email').in('empresa_id', ids).in('papel', ['owner', 'rh']).eq('desativado', false);
  let avisos = 0;
  for (const c of fechadas) {
    if (!podeReceber.has(c.empresa_id)) continue;
    const emails = [...new Set((gestores || []).filter((g: { empresa_id: string; email: string | null }) => g.empresa_id === c.empresa_id && g.email).map((g: { email: string }) => g.email))] as string[];
    for (const email of emails) {
      if (await enviar(email, `Campanha NR1 encerrada: ${c.nome}`, corpoNr1Encerrada(c.nome, c.data_fim))) avisos++;
    }
  }
  return { encerradas: fechadas.length, avisos };
}

// 3) Prazo do banco de talentos.
async function purgarBancoTalentos(admin: Banco, agora: number) {
  const { data, error } = await admin.from('rs_banco_talentos').delete().lt('criado_em', mesesAtras(agora, BANCO_TALENTOS_MESES)).select('id');
  if (error) throw new Error(error.message);
  return { removidos: data ? data.length : 0 };
}

// 6) Provas do processo seletivo: expira o link que venceu sem o candidato começar (quem JÁ começou segue o tempo
// da própria prova) e apaga resultados antigos (retenção de PROVAS_RETENCAO_MESES meses, contados da aplicação).
async function manterProvasRs(admin: Banco, agora: number) {
  const { data: expiradas, error: e1 } = await admin.from('rs_provas_aplicacoes').update({ status: 'expirada' }).eq('status', 'enviada').lt('prazo_ate', new Date(agora).toISOString()).select('id');
  if (e1) throw new Error(e1.message);
  const { data: removidas, error: e2 } = await admin.from('rs_provas_aplicacoes').delete().lt('criado_em', mesesAtras(agora, PROVAS_RETENCAO_MESES)).select('id');
  if (e2) throw new Error(e2.message);
  return { expiradas: expiradas ? expiradas.length : 0, removidas: removidas ? removidas.length : 0 };
}

// 7) Limpeza do log de limites.
async function limparLogs(admin: Banco, agora: number) {
  const { error } = await admin.from('rate_limit_log').delete().lt('criado_em', diasAtras(agora, DIAS_RETENCAO_LOG));
  if (error) throw new Error(error.message);
  return { ok: true };
}
// ---- fim: tarefas ----------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, chaveServico);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const auth = req.headers.get('Authorization') || '';

    // ================= STATUS (Super Admin logado) =================
    if (action === 'status') {
      const principal = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
      const {
        data: { user },
      } = await principal.auth.getUser();
      if (!user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
      const { data: sa } = await admin.from('super_admins').select('id').eq('id', user.id).maybeSingle();
      if (!sa) return jsonResponse({ error: 'Só o Super Admin vê isto.' }, 403);
      const ultima = async (acao: string) => {
        const { data } = await admin.from('rate_limit_log').select('criado_em').eq('chave', 'sistema').eq('acao', acao).order('criado_em', { ascending: false }).limit(1);
        return data && data.length ? data[0].criado_em : null;
      };
      return jsonResponse({ diaria: await ultima('rotina_diaria'), chamados: await ultima('rotina_chamados') });
    }

    // ================= ROTINA DIÁRIA (agendador) =================
    if (action !== 'diaria') return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
    const segredo = req.headers.get('x-cron-secret') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const autorizado = (CRON_SECRET && segredo && iguaisSeguro(segredo, CRON_SECRET)) || (token && chaveServico && iguaisSeguro(token, chaveServico));
    if (!autorizado) return jsonResponse({ error: 'Não autorizado.' }, 401);

    const agora = Date.now();
    const resultado: Record<string, unknown> = {};
    const falhas: string[] = [];
    // Cada tarefa é independente: se uma quebrar, as outras continuam.
    const tarefa = async (nome: string, fn: () => Promise<unknown>) => {
      try {
        resultado[nome] = await fn();
      } catch (e) {
        console.error(`Falha na tarefa ${nome}`, e);
        falhas.push(`${nome}: ${String((e as Error).message || e)}`);
        resultado[nome] = { erro: true };
      }
    };

    await tarefa('lembretes_ciclos', () => lembretesDeCiclos(admin, enviarEmail, agora));

    // ---- Escalonamento de justificativas do Ponto (a lógica fica na função "ponto", onde está o banco de ponto) ----
    await tarefa('escalonamento_ponto', async () => {
      const r = await fetch(`${url}/functions/v1/ponto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chaveServico}` },
        body: JSON.stringify({ action: 'rotina_escalonamento' }),
        signal: AbortSignal.timeout(90_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || `ponto respondeu HTTP ${r.status}`);
      return { escalonadas: d.escalonadas || 0, empresas: d.empresas || 0 };
    });

    await tarefa('banco_talentos', () => purgarBancoTalentos(admin, agora));
    await tarefa('teste_gratis', () => avisosDoTeste(admin, enviarEmail, agora, LINKS_TESTE, EMAIL_EQUIPE));
    await tarefa('nr1_campanhas', () => encerrarCampanhasNr1(admin, enviarEmail, agora));
    await tarefa('provas_rs', () => manterProvasRs(admin, agora));
    await tarefa('limpeza_logs', () => limparLogs(admin, agora));

    // Marca que a rotina rodou (o painel do Super Admin mostra isto).
    await admin.from('rate_limit_log').insert({ chave: 'sistema', acao: 'rotina_diaria' });

    if (falhas.length) {
      await enviarEmail(EMAIL_EQUIPE, 'Falha na rotina diária do sistema', `<p>A rotina diária terminou com problema em:</p><ul>${falhas.map((f) => `<li>${escaparHtml(f)}</li>`).join('')}</ul><p>As outras tarefas rodaram normalmente.</p>`);
    }
    return jsonResponse({ ok: falhas.length === 0, resultado, falhas });
  } catch (e) {
    console.error('Erro na função rotinas-agendadas:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Supabase > Edge Functions > nova função: rotinas-agendadas > cole este código >
//    Deploy — com "Verify JWT" DESLIGADO (ou use o deploy automático: já está no config.toml).
// 2) Secrets: CRON_SECRET (o mesmo da função chamado-automatico) e, opcional, EMAIL_EQUIPE.
// 3) AGENDAR: sem o passo 3 NADA disto roda sozinho. Veja docs/ROTINAS-AGENDADAS.md.
// =========================================================================
