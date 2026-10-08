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

// ---- Imagens enviadas (selfie, atestado) ----------------------------------
// BUG CORRIGIDO: a selfie e a foto do atestado aceitavam QUALQUER conteúdo, de qualquer
// tamanho, gravado como "image/jpeg". Pior: a regra "selfie obrigatória" só olhava se
// VEIO algum texto no campo — mandando lixo, o upload falhava em silêncio e a batida era
// registrada sem selfie. Agora a imagem é conferida pelos bytes reais (JPEG/PNG/WebP) e
// pelo tamanho; imagem inválida é recusada.
const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024;
function lerImagemBase64(entrada: unknown): { bytes: Uint8Array; mediaType: string; ext: string } | null {
  const base64 = String(entrada ?? '').split(',').pop() || '';
  if (!base64 || base64.length > Math.ceil((TAMANHO_MAX_IMAGEM * 4) / 3) + 8) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length > TAMANHO_MAX_IMAGEM) return null;
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, mediaType: 'image/jpeg', ext: 'jpg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((v, i) => bytes[i] === v)) return { bytes, mediaType: 'image/png', ext: 'png' };
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (bytes.length > 12 && riff.every((v, i) => bytes[i] === v) && webp.every((v, i) => bytes[8 + i] === v)) {
    return { bytes, mediaType: 'image/webp', ext: 'webp' };
  }
  return null;
}
// ---- fim: imagens enviadas -------------------------------------------------

// ---- Fuso horário (Brasil) ------------------------------------------------
// BUG CORRIGIDO: as Edge Functions rodam em UTC, mas a jornada (08:00–17:00) e os
// "dias" do sistema são do horário de Brasília. Usar getHours()/slice(0,10) direto
// no horário da batida comparava 11:00 (UTC) com 08:00 (local) — o banco de horas
// perdia a tolerância e premiava quem chega cedo — e a batida depois das 21h caía
// no dia seguinte. O Brasil não tem horário de verão desde 2019: UTC−3 fixo.
const FUSO_MIN = -180;
// Dia civil no Brasil (AAAA-MM-DD) de um carimbo de data/hora.
function diaLocal(iso: string): string {
  return new Date(Date.parse(iso) + FUSO_MIN * 60000).toISOString().slice(0, 10);
}
// Minutos desde a meia-noite, no horário do Brasil.
function minutosDoDiaLocal(iso: string): number {
  const d = new Date(Date.parse(iso) + FUSO_MIN * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
// "Agora" deslocado pro Brasil: use SEMPRE os métodos getUTC* nele.
function agoraBrasil(agora: number = Date.now()): Date {
  return new Date(agora + FUSO_MIN * 60000);
}
// Instante (UTC) em que o relógio do Brasil marca hora:min no dia AAAA-MM-DD.
function localParaUtc(dia: string, hora: number, min = 0): Date {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, hora, min) - FUSO_MIN * 60000);
}
// Saldo do banco de horas (minutos, + ou −): por dia, atraso na 1ª entrada e hora extra
// na última saída, ambos depois da tolerância; dia abonado não entra. Tudo no
// horário do Brasil (ver o bloco de fuso acima).
function calcularSaldoBancoHoras(
  registros: { tipo: string; registrado_em: string }[],
  jornada: { entrada?: string; saida?: string; toleranciaMin?: number },
  diasAbonados: Set<string>
): number {
  const porDia: Record<string, { tipo: string; registrado_em: string }[]> = {};
  registros.forEach((r) => {
    const dia = diaLocal(r.registrado_em);
    (porDia[dia] = porDia[dia] || []).push(r);
  });
  const tol = jornada.toleranciaMin || 0;
  const horarioParaMinutos = (h: string) => {
    const [a, b] = h.split(':').map(Number);
    return a * 60 + b;
  };
  let saldoMin = 0;
  Object.entries(porDia).forEach(([dia, regs]) => {
    if (diasAbonados.has(dia)) return; // dia abonado não entra no saldo
    const entradas = regs.filter((r) => r.tipo === 'entrada');
    const saidas = regs.filter((r) => r.tipo === 'saida');
    const primeira = entradas[0];
    const ultima = saidas[saidas.length - 1];
    let atraso = 0;
    if (primeira && jornada.entrada) {
      atraso = Math.max(0, minutosDoDiaLocal(primeira.registrado_em) - horarioParaMinutos(jornada.entrada) - tol);
    }
    let extra = 0;
    if (ultima && jornada.saida) {
      extra = Math.max(0, minutosDoDiaLocal(ultima.registrado_em) - horarioParaMinutos(jornada.saida) - tol);
    }
    saldoMin += extra - atraso;
  });
  return Math.round(saldoMin);
}
// Texto digitado por usuários (ex.: nome no cadastro) que vai pro HTML de um e-mail.
function escaparHtml(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// ---- fim: fuso horário -----------------------------------------------------

// ---- Escalonamento de justificativas ---------------------------------------------
// Justificativa parada esperando decisão há N dias sobe pra quem pode decidir (o
// substituto do gestor e o RH). ANTES isso só rodava quando alguém abria a tela de
// conferência — justamente se o aprovador estivesse sumido, nada subia. Agora a mesma
// regra também roda sozinha, todo dia, pela rotina agendada (ação "rotina_escalonamento").
const LIMITE_DIAS_ESCALONA = 3;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function avaliarEscalonamento(j: { status: string; criado_em: string }, agora: number): { dias: number; escalonar: boolean } {
  const dias = Math.floor((agora - new Date(j.criado_em).getTime()) / MS_POR_DIA);
  return { dias, escalonar: j.status === 'pendente' && dias >= LIMITE_DIAS_ESCALONA };
}

// Marca como escalonada e avisa por e-mail. Melhor esforço: se o e-mail falhar, a marcação
// já foi feita e a tela mostra o atraso de qualquer forma.
// deno-lint-ignore no-explicit-any
async function escalarJustificativa(ponto: any, principalAdmin: any, empresaId: string, colaboradores: any[], nomePorId: Record<string, string>, j: { id: string; perfil_id: string }, diasPendente: number) {
  await ponto.from('justificativas_ponto').update({ escalonado: true, escalonado_em: new Date().toISOString() }).eq('id', j.id);
  try {
    const colaborador = colaboradores.find((c: { perfilId: string }) => c.perfilId === j.perfil_id);
    const gestorId = colaborador?.gestorPerfilId;
    let destinatarios: string[] = [];
    if (gestorId) {
      const { data: gestorPerfil } = await principalAdmin
        .from('perfis')
        .select('email, substituto_perfil_id')
        .eq('id', gestorId)
        .maybeSingle();
      if (gestorPerfil?.substituto_perfil_id) {
        const { data: substitutoPerfil } = await principalAdmin
          .from('perfis')
          .select('email')
          .eq('id', gestorPerfil.substituto_perfil_id)
          .maybeSingle();
        if (substitutoPerfil?.email) destinatarios.push(substitutoPerfil.email);
      }
    }
    const { data: rhPerfis } = await principalAdmin
      .from('perfis')
      .select('email')
      .eq('empresa_id', empresaId)
      .in('papel', ['rh', 'owner']);
    (rhPerfis || []).forEach((p: { email: string | null }) => {
      if (p.email && !destinatarios.includes(p.email)) destinatarios.push(p.email);
    });
    if (destinatarios.length) {
      await Promise.all(
        destinatarios.map((email) =>
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({
              destinatario: email,
              assunto: `Justificativa parada há ${diasPendente} dias — ${nomePorId[j.perfil_id] || 'colaborador'}`,
              corpoHtml: `<p>Uma justificativa de <b>${escaparHtml(nomePorId[j.perfil_id] || 'um colaborador')}</b> está aguardando decisão há ${diasPendente} dias sem resposta do aprovador original.</p><p>Acesse a Conferência de Ponto para decidir.</p>`,
            }),
          }).catch(() => {})
        )
      );
    }
  } catch (e) {
    console.error('Falha ao notificar escalonamento', e);
  }
}
// ---- fim: escalonamento ----------------------------------------------------------

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

    // ---- Ação INTERNA da rotina agendada: só com a chave de serviço (nunca por usuário) ----
    const corpoPrevio = await req.clone().json().catch(() => ({}));
    if (corpoPrevio?.action === 'rotina_escalonamento') {
      const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
      let diferenca = token.length ^ chaveServico.length;
      for (let i = 0; i < Math.min(token.length, chaveServico.length); i++) diferenca |= token.charCodeAt(i) ^ chaveServico.charCodeAt(i);
      if (!chaveServico || diferenca !== 0) return jsonResponse({ error: 'Não autorizado.' }, 401);

      const pontoRotina = createClient(PONTO_SUPABASE_URL, PONTO_SUPABASE_SERVICE_ROLE_KEY);
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const limite = new Date(Date.now() - LIMITE_DIAS_ESCALONA * MS_POR_DIA).toISOString();
      const { data: pendentes, error: erroPend } = await pontoRotina
        .from('justificativas_ponto')
        .select('id, empresa_id, perfil_id, status, criado_em, escalonado')
        .eq('status', 'pendente')
        .eq('escalonado', false)
        .lte('criado_em', limite)
        .limit(500);
      if (erroPend) return jsonResponse({ error: erroPend.message }, 500);

      const porEmpresa = new Map<string, { id: string; perfil_id: string; status: string; criado_em: string }[]>();
      for (const j of pendentes || []) (porEmpresa.get(j.empresa_id) || porEmpresa.set(j.empresa_id, []).get(j.empresa_id)!).push(j);

      let escalonadas = 0;
      for (const [empresaId, lista] of porEmpresa) {
        // Empresa suspensa ou com teste vencido não recebe e-mail automático.
        const { data: emp } = await admin.from('empresas').select('acesso_suspenso, trial_ate, is_pagante').eq('id', empresaId).maybeSingle();
        if (!emp || emp.acesso_suspenso || (emp.trial_ate && !emp.is_pagante && new Date(emp.trial_ate).getTime() < Date.now())) continue;
        const { data: dadosRow } = await admin.from('dados_sistema').select('colaboradores:payload->colaboradores').eq('empresa_id', empresaId).maybeSingle();
        const colaboradores = (dadosRow?.colaboradores as unknown[]) || [];
        const { data: perfis } = await admin.from('perfis').select('id, nome').in('id', [...new Set(lista.map((j) => j.perfil_id))]);
        const nomePorId = Object.fromEntries((perfis || []).map((p: { id: string; nome: string }) => [p.id, p.nome]));
        for (const j of lista) {
          const { dias, escalonar } = avaliarEscalonamento(j, Date.now());
          if (!escalonar) continue;
          await escalarJustificativa(pontoRotina, admin, empresaId, colaboradores, nomePorId, j, dias);
          escalonadas++;
        }
      }
      return jsonResponse({ ok: true, escalonadas, empresas: porEmpresa.size });
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

    // ---- Totem: código QR do momento (só o Administrador/owner pode exibir) ----
    if (action === 'qr_atual') {
      if (perfil.papel !== 'owner') {
        return jsonResponse({ error: 'Apenas o Administrador da empresa pode exibir o totem.' }, 403);
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

      // Selfie: se veio, tem que ser uma imagem de verdade; se a empresa exige, tem que vir.
      const selfie = body.selfieBase64 ? lerImagemBase64(body.selfieBase64) : null;
      if (body.selfieBase64 && !selfie) {
        return jsonResponse({ error: 'A selfie enviada não é uma imagem válida (JPG, PNG ou WebP, até 5 MB). Tire a foto de novo.', codigo: 'selfie_invalida' }, 400);
      }
      if (seg?.exige_selfie && !selfie) {
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
      if (selfie) {
        try {
          const nome = `${perfil.empresa_id}/${perfil.id}/${Date.now()}.${selfie.ext}`;
          const up = await ponto.storage.from('selfies-ponto').upload(nome, selfie.bytes, { contentType: selfie.mediaType, upsert: false });
          if (!up.error) selfiePath = nome;
          else console.error('Falha ao subir selfie', up.error);
        } catch (e) {
          console.error('Erro processando selfie', e);
        }
        // Empresa que EXIGE selfie não pode registrar a batida se a foto não foi guardada.
        if (seg?.exige_selfie && !selfiePath) {
          return jsonResponse({ error: 'Não foi possível guardar a selfie. Tente bater o ponto de novo.', codigo: 'selfie_falhou' }, 500);
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

    if (action === 'gerar_dados_teste') {
      // Só pra demonstração/apresentação: cria alguns registros de ponto e
      // justificativas de exemplo pra ESTA pessoa logada (owner/rh) — não
      // dá pra fabricar registros de outras pessoas porque elas precisam
      // de uma conta de login de verdade (perfil_id real).
      if (!['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Sem permissão.' }, 403);
      const hojeBR = agoraBrasil();
      const diaCivil = (diasAtras: number) => new Date(Date.UTC(hojeBR.getUTCFullYear(), hojeBR.getUTCMonth(), hojeBR.getUTCDate() - diasAtras));
      const registros = [];
      for (let diasAtras = 6; diasAtras >= 1; diasAtras--) {
        const dia = diaCivil(diasAtras);
        if (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) continue; // pula fim de semana
        const atraso = diasAtras === 3 ? 22 : 0; // um dia com atraso, pra aparecer no banco de horas
        const diaStr = dia.toISOString().slice(0, 10);
        const entrada = localParaUtc(diaStr, 8, atraso); // 08:00 no relógio do Brasil
        const saida = localParaUtc(diaStr, 17, 5); // 17:05 no relógio do Brasil
        registros.push(
          { empresa_id: perfil.empresa_id, perfil_id: perfil.id, tipo: 'entrada', registrado_em: entrada.toISOString() },
          { empresa_id: perfil.empresa_id, perfil_id: perfil.id, tipo: 'saida', registrado_em: saida.toISOString() }
        );
      }
      if (registros.length) await ponto.from('registros_ponto').insert(registros);

      const dataJustifPendente = diaCivil(2);
      const dataJustifAprovada = diaCivil(10);
      await ponto.from('justificativas_ponto').insert([
        {
          empresa_id: perfil.empresa_id,
          perfil_id: perfil.id,
          tipo: 'atraso_saida',
          data_ref: dataJustifPendente.toISOString().slice(0, 10),
          motivo: 'Consulta médica pela manhã (exemplo de demonstração)',
          status: 'pendente',
        },
        {
          empresa_id: perfil.empresa_id,
          perfil_id: perfil.id,
          tipo: 'atestado',
          data_ref: dataJustifAprovada.toISOString().slice(0, 10),
          motivo: 'Atestado médico (exemplo de demonstração)',
          status: 'aprovada',
          qtd_dias: 1,
        },
      ]);
      return jsonResponse({ ok: true });
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

    // ---- Conferência: batidas do período com nome e a FOTO (só RH/owner) ----
    if (action === 'conferencia') {
      if (perfil.papel !== 'owner' && perfil.papel !== 'rh') {
        return jsonResponse({ error: 'Só RH ou Administrador podem conferir as fotos do ponto.' }, 403);
      }
      const inicio = body.inicioISO;
      const fim = body.fimISO;
      if (!inicio || !fim) return jsonResponse({ error: 'inicioISO e fimISO são obrigatórios.' }, 400);

      const { data: registros, error } = await ponto
        .from('registros_ponto')
        .select('id, perfil_id, tipo, registrado_em, validado_qr, selfie_path')
        .eq('empresa_id', perfil.empresa_id)
        .gte('registrado_em', inicio)
        .lt('registrado_em', fim)
        .order('registrado_em', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const idsUnicos = [...new Set((registros || []).map((r) => r.perfil_id))];
      const { data: perfis } = await principalAdmin.from('perfis').select('id, nome').in('id', idsUnicos);
      const nomePorId = Object.fromEntries((perfis || []).map((p) => [p.id, p.nome]));

      // O bucket é privado — geramos uma URL assinada (temporária, 1h) pra
      // cada foto, pra o RH conseguir ver a imagem sem o bucket ser público.
      const comFoto = await Promise.all(
        (registros || []).map(async (r) => {
          let selfieUrl = null;
          if (r.selfie_path) {
            const { data: assinada } = await ponto.storage
              .from('selfies-ponto')
              .createSignedUrl(r.selfie_path, 3600);
            selfieUrl = assinada?.signedUrl || null;
          }
          return {
            id: r.id,
            perfil_id: r.perfil_id,
            nome: nomePorId[r.perfil_id] || 'Conta removida',
            tipo: r.tipo,
            registrado_em: r.registrado_em,
            validado_qr: r.validado_qr,
            selfieUrl,
          };
        })
      );

      return jsonResponse({ registros: comFoto });
    }

    // ---- Justificativas / abonos ----
    if (action === 'justificativa_criar') {
      // Bloqueia se a data pedida cair numa competência fechada e não reaberta.
      if (body.dataRef) {
        const competenciaDoDia = `${String(body.dataRef).slice(0, 7)}-01`;
        const { data: fechada } = await ponto
          .from('competencias_fechadas')
          .select('reaberto')
          .eq('empresa_id', perfil.empresa_id)
          .eq('competencia', competenciaDoDia)
          .maybeSingle();
        if (fechada && !fechada.reaberto) {
          return jsonResponse(
            { error: 'Esta competência já está fechada. Peça ao RH/Administrador para reabri-la antes de enviar esta justificativa.' },
            409
          );
        }
      }
      // Colaborador cria um pedido. Se veio foto de atestado, sobe pro bucket.
      let atestadoPath: string | null = null;
      if (body.atestadoBase64) {
        const foto = lerImagemBase64(body.atestadoBase64);
        if (!foto) {
          return jsonResponse({ error: 'A foto do atestado não é uma imagem válida (JPG, PNG ou WebP, até 5 MB).' }, 400);
        }
        try {
          const nome = `${perfil.empresa_id}/${perfil.id}/${Date.now()}.${foto.ext}`;
          const up = await ponto.storage.from('atestados-ponto').upload(nome, foto.bytes, { contentType: foto.mediaType, upsert: false });
          if (!up.error) atestadoPath = nome;
          else console.error('Falha ao subir atestado', up.error);
        } catch (e) {
          console.error('Erro processando atestado', e);
        }
      }
      const colaborador = body.colaboradorId || null;
      const { data, error } = await ponto
        .from('justificativas_ponto')
        .insert({
          empresa_id: perfil.empresa_id,
          perfil_id: perfil.id,
          colaborador_id: colaborador,
          tipo: body.tipo,
          data_ref: body.dataRef,
          motivo: body.motivo || '',
          hora_ajuste: body.horaAjuste || null,
          qtd_dias: body.qtdDias || 1,
          atestado_path: atestadoPath,
          // Atestado médico abona automaticamente (é um direito, não conta como
          // falta): já nasce aprovado. O RH ainda vê na lista pra conferir a
          // foto e pode reverter se for inválido. Os demais tipos ficam
          // pendentes, aguardando decisão do gestor/RH.
          status: body.tipo === 'atestado' ? 'aprovada' : 'pendente',
        })
        .select('id')
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ id: data.id });
    }

    if (action === 'justificativa_minhas') {
      // O colaborador vê as próprias justificativas.
      const { data, error } = await ponto
        .from('justificativas_ponto')
        .select('id, tipo, data_ref, motivo, hora_ajuste, qtd_dias, status, motivo_decisao, atestado_path, criado_em')
        .eq('perfil_id', perfil.id)
        .order('criado_em', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ justificativas: data || [] });
    }

    // ---- Alertas do dashboard: substituto de aprovador não definido, e
    //      competência do mês anterior ainda não fechada. Uma chamada só,
    //      pra não multiplicar ida-e-volta no carregamento do painel. ----
    if (action === 'dashboard_alertas') {
      if (!['owner', 'rh', 'lider'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão.' }, 403);
      }
      const { data: meuPerfilRow } = await principalAdmin.from('perfis').select('substituto_perfil_id').eq('id', perfil.id).maybeSingle();
      const substitutoDefinido = !!meuPerfilRow?.substituto_perfil_id;

      const hoje = new Date();
      const hojeBR = agoraBrasil();
      const mesAnterior = new Date(Date.UTC(hojeBR.getUTCFullYear(), hojeBR.getUTCMonth() - 1, 1));
      const competenciaAnteriorStr = mesAnterior.toISOString().slice(0, 10);
      const { data: fechadaRow } = await ponto
        .from('competencias_fechadas')
        .select('reaberto')
        .eq('empresa_id', perfil.empresa_id)
        .eq('competencia', competenciaAnteriorStr)
        .maybeSingle();
      const competenciaAnteriorFechada = !!fechadaRow && !fechadaRow.reaberto;
      const mesAnteriorLabel = mesAnterior.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      // Justificativas por status nos últimos 30 dias — pro gráfico do painel.
      const ha30dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: justif30d } = await ponto
        .from('justificativas_ponto')
        .select('status')
        .eq('empresa_id', perfil.empresa_id)
        .gte('criado_em', ha30dias);
      const justificativasPorStatus = { pendente: 0, aprovada: 0, rejeitada: 0 };
      (justif30d || []).forEach((j: { status: string }) => {
        if (justificativasPorStatus[j.status as keyof typeof justificativasPorStatus] !== undefined) {
          justificativasPorStatus[j.status as keyof typeof justificativasPorStatus]++;
        }
      });

      return jsonResponse({ substitutoDefinido, competenciaAnteriorFechada, mesAnteriorLabel, justificativasPorStatus });
    }

    // ---- Substituto de aprovador: lista colegas líder/RH da empresa (pro
    //      dropdown) e permite ao líder/RH definir/trocar o próprio substituto. ----
    if (action === 'substituto_listar_candidatos') {
      const { data: colegas } = await principalAdmin
        .from('perfis')
        .select('id, nome, papel')
        .eq('empresa_id', perfil.empresa_id)
        .in('papel', ['lider', 'rh', 'owner'])
        .neq('id', perfil.id);
      return jsonResponse({ candidatos: colegas || [] });
    }

    if (action === 'substituto_definir') {
      if (!['owner', 'rh', 'lider'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão.' }, 403);
      }
      const substitutoId = body.substitutoPerfilId || null;
      if (substitutoId) {
        // Confirma que o substituto é da mesma empresa antes de gravar.
        const { data: subPerfil } = await principalAdmin
          .from('perfis')
          .select('id, empresa_id')
          .eq('id', substitutoId)
          .maybeSingle();
        if (!subPerfil || subPerfil.empresa_id !== perfil.empresa_id) {
          return jsonResponse({ error: 'Substituto inválido.' }, 400);
        }
      }
      const { error } = await principalAdmin
        .from('perfis')
        .update({ substituto_perfil_id: substitutoId })
        .eq('id', perfil.id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'justificativa_pendentes') {
      // Gestor/RH vê as pendentes da empresa pra aprovar. (owner/rh/lider)
      if (!['owner', 'rh', 'lider'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão para ver justificativas da equipe.' }, 403);
      }
      const filtro = body.status || 'pendente';
      let q = ponto
        .from('justificativas_ponto')
        .select('id, perfil_id, tipo, data_ref, motivo, hora_ajuste, qtd_dias, status, atestado_path, criado_em, escalonado')
        .eq('empresa_id', perfil.empresa_id)
        .order('criado_em', { ascending: false });
      if (filtro !== 'todas') q = q.eq('status', filtro);
      const { data: js, error } = await q;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Resolve nomes e, se houver atestado, uma URL assinada temporária.
      const ids = [...new Set((js || []).map((j) => j.perfil_id))];
      const { data: perfis } = await principalAdmin.from('perfis').select('id, nome').in('id', ids);
      const nomePorId = Object.fromEntries((perfis || []).map((p) => [p.id, p.nome]));

      // Colaboradores (pro gestor de cada um) vêm do blob principal.
      const { data: dadosRow } = await principalAdmin
        .from('dados_sistema')
        .select('payload')
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      const colaboradores = dadosRow?.payload?.colaboradores || [];

      const agora = Date.now();

      const comExtras = await Promise.all(
        (js || []).map(async (j) => {
          let atestadoUrl = null;
          if (j.atestado_path) {
            const { data: assinada } = await ponto.storage.from('atestados-ponto').createSignedUrl(j.atestado_path, 3600);
            atestadoUrl = assinada?.signedUrl || null;
          }
          const { dias: diasPendente, escalonar: deveEscalonar } = avaliarEscalonamento(j, agora);

          // Na primeira vez que cruza o limite: marca e avisa (lógica compartilhada com a rotina agendada).
          if (deveEscalonar && !j.escalonado) {
            await escalarJustificativa(ponto, principalAdmin, perfil.empresa_id, colaboradores, nomePorId, j, diasPendente);
          }

          return { ...j, nome: nomePorId[j.perfil_id] || 'Colaborador', atestadoUrl, diasPendente, escalonado: j.escalonado || deveEscalonar };
        })
      );
      return jsonResponse({ justificativas: comExtras });
    }

    if (action === 'justificativa_decidir') {
      // Gestor/RH aprova ou rejeita.
      if (!['owner', 'rh', 'lider'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão para decidir justificativas.' }, 403);
      }
      const novoStatus = body.aprovar ? 'aprovada' : 'rejeitada';
      const { error } = await ponto
        .from('justificativas_ponto')
        .update({
          status: novoStatus,
          motivo_decisao: body.motivoDecisao || null,
          decidido_por: perfil.id,
          decidido_em: new Date().toISOString(),
        })
        .eq('id', body.justificativaId)
        .eq('empresa_id', perfil.empresa_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: novoStatus });
    }

    // ---- Dias abonados (justificativas aprovadas) de uma pessoa num período,
    //      pra o cálculo de horas/atrasos ignorar esses dias. ----
    if (action === 'justificativa_abonos') {
      const inicio = body.inicioISO;
      const fim = body.fimISO;
      if (!inicio || !fim) return jsonResponse({ error: 'inicioISO e fimISO são obrigatórios.' }, 400);

      // Relatório semanal (RH/owner): todos os abonos da empresa no período,
      // com o perfil_id de cada um, pra casar com cada pessoa da grade.
      if (body.todaEmpresa) {
        if (!['owner', 'rh'].includes(perfil.papel)) {
          return jsonResponse({ error: 'Sem permissão.' }, 403);
        }
        const { data, error } = await ponto
          .from('justificativas_ponto')
          .select('data_ref, tipo, perfil_id')
          .eq('empresa_id', perfil.empresa_id)
          .eq('status', 'aprovada')
          .gte('data_ref', inicio.slice(0, 10))
          .lte('data_ref', fim.slice(0, 10));
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ abonos: data || [] });
      }

      // Se pediu de um perfil específico, precisa ser owner/rh; senão, retorna os do próprio.
      let alvoPerfil = perfil.id;
      if (body.perfilId && body.perfilId !== perfil.id) {
        if (!['owner', 'rh'].includes(perfil.papel)) {
          return jsonResponse({ error: 'Sem permissão.' }, 403);
        }
        alvoPerfil = body.perfilId;
      }
      const { data, error } = await ponto
        .from('justificativas_ponto')
        .select('data_ref, tipo')
        .eq('empresa_id', perfil.empresa_id)
        .eq('status', 'aprovada')
        .gte('data_ref', inicio.slice(0, 10))
        .lte('data_ref', fim.slice(0, 10))
        .eq('perfil_id', alvoPerfil);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ abonos: data || [] });
    }

    // ---- Banco de horas: saldo acumulado (positivo ou negativo) de um
    //      colaborador num período, somando (extra - atraso) de cada dia com
    //      jornada, ignorando dias abonados. A jornada vive no cadastro do
    //      colaborador (payload.colaboradores, no banco principal). ----
    if (action === 'banco_horas_saldo') {
      const inicio = body.inicioISO;
      const fim = body.fimISO;
      if (!inicio || !fim) return jsonResponse({ error: 'inicioISO e fimISO são obrigatórios.' }, 400);
      let alvoPerfil = perfil.id;
      if (body.perfilId && body.perfilId !== perfil.id) {
        if (!['owner', 'rh'].includes(perfil.papel)) {
          return jsonResponse({ error: 'Sem permissão.' }, 403);
        }
        alvoPerfil = body.perfilId;
      }

      // Jornada do colaborador (vem do blob principal).
      const { data: dadosRow } = await principalAdmin
        .from('dados_sistema')
        .select('payload')
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      const colaboradores = dadosRow?.payload?.colaboradores || [];
      const colaborador = colaboradores.find((c: { perfilId: string }) => c.perfilId === alvoPerfil);
      const jornada = colaborador?.jornada || null;
      if (!jornada) return jsonResponse({ saldoMin: 0, semJornada: true });

      const { data: registros, error: errReg } = await ponto
        .from('registros_ponto')
        .select('tipo, registrado_em')
        .eq('empresa_id', perfil.empresa_id)
        .eq('perfil_id', alvoPerfil)
        .gte('registrado_em', inicio)
        .lt('registrado_em', fim)
        .order('registrado_em', { ascending: true });
      if (errReg) return jsonResponse({ error: errReg.message }, 500);

      const { data: abonos } = await ponto
        .from('justificativas_ponto')
        .select('data_ref')
        .eq('empresa_id', perfil.empresa_id)
        .eq('perfil_id', alvoPerfil)
        .eq('status', 'aprovada')
        .gte('data_ref', String(inicio).slice(0, 10))
        .lt('data_ref', String(fim).slice(0, 10));
      const diasAbonados = new Set<string>((abonos || []).map((a: { data_ref: string }) => a.data_ref));

      return jsonResponse({ saldoMin: calcularSaldoBancoHoras(registros || [], jornada, diasAbonados) });
    }

    // ---- Fechamento de competência (mês) — trava o período para
    //      justificativas/ajustes; só owner/rh fecha ou reabre. ----
    if (action === 'competencia_fechar') {
      if (!['owner', 'rh'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão para fechar competência.' }, 403);
      }
      const competencia = body.competencia; // 'AAAA-MM-01'
      if (!competencia) return jsonResponse({ error: 'competencia é obrigatória.' }, 400);
      const { error } = await ponto
        .from('competencias_fechadas')
        .insert({ empresa_id: perfil.empresa_id, competencia, fechado_por: perfil.id });
      if (error) {
        if (String(error.message).includes('duplicate') || String(error.code) === '23505') {
          return jsonResponse({ error: 'Esta competência já está fechada.' }, 409);
        }
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (action === 'competencia_reabrir') {
      if (!['owner', 'rh'].includes(perfil.papel)) {
        return jsonResponse({ error: 'Sem permissão para reabrir competência.' }, 403);
      }
      const { error } = await ponto
        .from('competencias_fechadas')
        .update({
          reaberto: true,
          reaberto_em: new Date().toISOString(),
          reaberto_por: perfil.id,
          motivo_reabertura: body.motivo || null,
        })
        .eq('empresa_id', perfil.empresa_id)
        .eq('competencia', body.competencia);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'competencia_status') {
      const { data, error } = await ponto
        .from('competencias_fechadas')
        .select('competencia, fechado_em, reaberto, reaberto_em, motivo_reabertura')
        .eq('empresa_id', perfil.empresa_id)
        .order('competencia', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ competencias: data || [] });
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
