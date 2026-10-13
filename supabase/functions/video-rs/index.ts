// =========================================================================
// NORTE — Edge Function "video-rs"
// =========================================================================
// Vídeo de apresentação do candidato (etapa do processo seletivo). Duas "portas":
//
//   1) RH (Administrador e RH, com login): pede o vídeo a um candidato do funil (o candidato recebe um link),
//      acompanha, ASSISTE (por link temporário) e exclui.
//   2) CANDIDATO (sem login, só com o código do link): abre a página video.html, grava ou escolhe o vídeo e envia.
//
// O vídeo NÃO passa por esta função: ela só autoriza (cria um link de envio de uso restrito a UM caminho) e depois
// CONFERE o que chegou — o arquivo vai direto do navegador do candidato para o armazenamento privado.
//
// Regras (cada uma tem teste):
//   - Máximo de 2 MINUTOS (VIDEO_SEGUNDOS_MAX). O navegador do candidato confere a duração; como o servidor não
//     "assiste" o vídeo, a trava de verdade é o TAMANHO máximo (40 MB), imposto pelo próprio armazenamento.
//   - A função confere o tipo REAL do arquivo pelos primeiros bytes (não confia no que o navegador declarou).
//   - O código do link é aleatório (256 bits) e só o HASH dele fica no banco. Uma única entrega por pedido.
//   - Só Administrador e RH assistem; o link de visualização dura 10 minutos.
//   - O arquivo e o registro são apagados depois de 6 meses (rotina diária) — ou antes, se o RH excluir.
//
// "Verify JWT" fica DESLIGADO (a porta do candidato não tem login): a função se protege sozinha.
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

const URL_SITE = (Deno.env.get('URL_SITE') || 'https://rhalley21.github.io/Sistema-Norte/').replace(/\/?$/, '/');

// ---- Vídeos: regras puras (testadas) ---------------------------------------------------------

const VIDEO_SEGUNDOS_MAX = 120; // 2 minutos
const VIDEO_BYTES_MAX = 40 * 1024 * 1024; // 40 MB (o plano gratuito do Supabase aceita até ~50 MB por arquivo)
const VIDEO_BYTES_MIN = 10 * 1024; // abaixo disso não é um vídeo de verdade
const VIDEO_RETENCAO_MESES = 6; // o MESMO número da Política de Privacidade, da rotina diária e da documentação
const VALIDADE_PADRAO_DIAS = 7;
const VALIDADE_MAX_DIAS = 30;
const MAX_PEDIDOS_POR_DIA = 300;
const BUCKET = 'videos-candidatos';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MIMES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const STATUS_ATIVOS = ['solicitado'];

function escaparHtml(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function limparTexto(v: unknown): string {
  return String(v ?? '').split('\u0000').join('').trim();
}
function emailValido(e: unknown): boolean {
  return /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/.test(String(e ?? '')) && String(e).length <= 254;
}

function gerarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hashToken(token: string): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// "video/webm;codecs=vp9,opus" -> "video/webm"
function mimeBase(m: unknown): string {
  return String(m ?? '').split(';')[0].trim().toLowerCase();
}

// O que o candidato diz que vai enviar: formato permitido e tamanho dentro do limite.
function validarEnvio(entrada: any): { ok: boolean; erro?: string; mime?: string; ext?: string } {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const mime = mimeBase(e.mime);
  if (!MIMES[mime]) return { ok: false, erro: 'Formato de vídeo não aceito. Use MP4, WebM ou MOV (ou grave pela própria página).' };
  const tamanho = Number(e.tamanho);
  if (!Number.isInteger(tamanho) || tamanho < VIDEO_BYTES_MIN) return { ok: false, erro: 'O arquivo parece vazio ou inválido.' };
  if (tamanho > VIDEO_BYTES_MAX) return { ok: false, erro: `O vídeo passa de ${Math.round(VIDEO_BYTES_MAX / 1048576)} MB. Grave pela própria página (fica menor) ou comprima o arquivo.` };
  return { ok: true, mime, ext: MIMES[mime] };
}

// Tipo REAL do arquivo pelos primeiros bytes: MP4/MOV começam com "....ftyp"; WebM começa com a assinatura EBML.
function familiaPeloConteudo(bytes: Uint8Array): 'mp4' | 'webm' | null {
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  return null;
}
// O conteúdo bate com o formato declarado? (MP4 e MOV são da mesma família "ftyp".)
function conteudoCombinaComMime(bytes: Uint8Array, mime: string): boolean {
  const familia = familiaPeloConteudo(bytes);
  if (!familia) return false;
  return (familia === 'webm') === (mimeBase(mime) === 'video/webm');
}

function duracaoSanitizada(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 3600 ? n : null; // é só informativa: quem informa é o navegador do candidato
}

function situacaoVideo(v: { status: string; prazo_ate: string }, agora: number): string {
  if (v.status === 'solicitado' && Date.parse(v.prazo_ate) < agora) return 'expirado';
  return v.status;
}

function caminhoDoVideo(empresaId: string, videoId: string, ext: string): string {
  return `${empresaId}/${videoId}/video.${ext}`;
}

// Link do e-mail: só aceita o site em que o RH está (Origin) ou o URL_SITE configurado.
function urlBaseSegura(urlBase: unknown, origemRequisicao: string | null, urlSite: string): string {
  const padrao = urlSite.endsWith('/') ? urlSite : `${urlSite}/`;
  try {
    const u = new URL(String(urlBase || ''));
    const seguroProtocolo = u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
    const origemSite = new URL(padrao).origin;
    const permitido = u.origin === origemSite || (!!origemRequisicao && u.origin === origemRequisicao);
    if (!seguroProtocolo || !permitido || !/^\/[A-Za-z0-9_./-]*$/.test(u.pathname)) return padrao;
    return `${u.origin}${u.pathname.replace(/[^/]*$/, '')}`;
  } catch {
    return padrao;
  }
}

function corpoEmailVideo(nome: string, empresa: string, instrucoes: string, link: string, prazoISO: string): string {
  const [a, m, d] = String(prazoISO).slice(0, 10).split('-');
  const texto = instrucoes ? `<p><b>Orientações:</b><br>${escaparHtml(instrucoes).replace(/\n/g, '<br>')}</p>` : '';
  return `<p>Olá, ${escaparHtml(nome)}!</p>
<p><b>${escaparHtml(empresa)}</b> convidou você para a etapa de <b>vídeo de apresentação</b> do processo seletivo.</p>
${texto}
<p>O vídeo pode ter até <b>${VIDEO_SEGUNDOS_MAX / 60} minutos</b>. Você pode gravá-lo pelo próprio navegador (no celular ou no computador) ou enviar um arquivo de até ${Math.round(VIDEO_BYTES_MAX / 1048576)} MB. O link vale até <b>${d}/${m}/${a}</b>.</p>
<p><a href="${escaparHtml(link)}">Enviar meu vídeo</a></p>
<p style="color:#666;">O vídeo será visto apenas pela equipe de recrutamento da empresa e guardado por até ${VIDEO_RETENCAO_MESES} meses. Se você não se candidatou a uma vaga nessa empresa, ignore este e-mail. O link é pessoal: não compartilhe.</p>
<p>Instituto INETRIS — plataforma de gestão de pessoas</p>`;
}
// ---- fim: regras puras -----------------------------------------------------------------------

// ---- Vídeos: operações (recebem o banco e o armazenamento — por isso dá pra testar o comportamento) ----
// deno-lint-ignore no-explicit-any
type Admin = any;
const T = 'rs_videos';
const COLS_RESUMO = 'id, candidato_ref, candidato_nome, candidato_email, status, prazo_ate, mime, tamanho_bytes, duracao_s, enviado_em, criado_em';
const ERRO_LINK = 'Este link é inválido ou expirou. Peça um novo link a quem convidou você.';

// O que o RH vê (nunca o código nem o caminho interno do arquivo).
function resumoVideo(v: any, agora: number) {
  return {
    id: v.id,
    candidato_ref: v.candidato_ref,
    candidato_nome: v.candidato_nome,
    candidato_email: v.candidato_email,
    status: situacaoVideo(v, agora),
    criado_em: v.criado_em,
    prazo_ate: v.prazo_ate,
    enviado_em: v.enviado_em,
    mime: v.mime,
    tamanho_bytes: v.tamanho_bytes === null || v.tamanho_bytes === undefined ? null : Number(v.tamanho_bytes),
    duracao_s: v.duracao_s ?? null,
    acima_do_limite: v.duracao_s !== null && v.duracao_s !== undefined && v.duracao_s > VIDEO_SEGUNDOS_MAX + 5,
  };
}

async function buscarPorToken(admin: Admin, token: string) {
  const { data } = await admin.from(T).select('*').eq('token_hash', await hashToken(token)).maybeSingle();
  return data || null;
}
async function nomeDaEmpresa(admin: Admin, empresaId: string): Promise<string> {
  const { data } = await admin.from('empresas').select('nome_fantasia').eq('id', empresaId).maybeSingle();
  return data?.nome_fantasia || 'a empresa';
}

// ---------- Porta do CANDIDATO ----------
async function visaoDoCandidato(admin: Admin, v: any, agora: number) {
  const estado = situacaoVideo(v, agora);
  const empresa = await nomeDaEmpresa(admin, v.empresa_id);
  const base = { ok: true, estado, empresa };
  if (estado === 'solicitado') return { ...base, instrucoes: v.instrucoes || '', limites: { segundos: VIDEO_SEGUNDOS_MAX, bytes: VIDEO_BYTES_MAX, retencaoMeses: VIDEO_RETENCAO_MESES } };
  return base; // enviado / expirado / cancelado: sem detalhes
}

async function candidatoAbrir(admin: Admin, token: string, agora: number) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  return { http: 200, corpo: await visaoDoCandidato(admin, v, agora) };
}

// Autoriza o envio: valida o que o candidato declara e devolve um link de envio restrito a UM caminho.
async function candidatoPreparar(admin: Admin, token: string, entrada: unknown, agora: number) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoVideo(v, agora);
  if (estado !== 'solicitado') return { http: 409, corpo: { error: estado === 'enviado' ? 'Seu vídeo já foi enviado. Obrigado!' : 'Este pedido de vídeo não está mais aberto.', estado } };
  const val = validarEnvio(entrada);
  if (!val.ok) return { http: 400, corpo: { error: val.erro } };
  const caminho = caminhoDoVideo(v.empresa_id, v.id, val.ext!);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho, { upsert: true });
  if (error || !data) return { http: 500, corpo: { error: 'Não foi possível preparar o envio agora. Tente de novo.' } };
  return { http: 200, corpo: { ok: true, caminho, token: data.token, mime: val.mime } };
}

// Confere o que chegou ao armazenamento (existe? tamanho? é vídeo de verdade?) e só então marca como enviado.
async function candidatoConfirmar(admin: Admin, token: string, entrada: any, agora: number, lerInicio: (url: string) => Promise<Uint8Array>) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoVideo(v, agora);
  if (estado === 'enviado') return { http: 200, corpo: { ok: true, estado: 'enviado' } }; // reenvio da confirmação: idempotente
  if (estado !== 'solicitado') return { http: 409, corpo: { error: 'Este pedido de vídeo não está mais aberto.', estado } };

  const pasta = `${v.empresa_id}/${v.id}`;
  const { data: arquivos } = await admin.storage.from(BUCKET).list(pasta);
  const lista = (arquivos || []).filter((a: any) => /^video\.(mp4|webm|mov)$/.test(String(a.name)));
  const apagarTudo = async () => {
    if (lista.length) await admin.storage.from(BUCKET).remove(lista.map((a: any) => `${pasta}/${a.name}`));
  };
  if (lista.length !== 1) {
    await apagarTudo(); // nenhum (o envio não chegou) ou mais de um (tentativas com formatos diferentes): recomeça limpo
    return { http: 400, corpo: { error: lista.length ? 'Houve mais de um envio. Envie o vídeo de novo.' : 'O vídeo não chegou. Tente enviar de novo.' } };
  }
  const arquivo = lista[0];
  const caminho = `${pasta}/${arquivo.name}`;
  const ext = String(arquivo.name).split('.').pop() as string;
  const mime = Object.keys(MIMES).find((m) => MIMES[m] === ext)!;
  const tamanho = Number(arquivo.metadata?.size ?? 0);
  if (tamanho < VIDEO_BYTES_MIN || tamanho > VIDEO_BYTES_MAX) {
    await apagarTudo();
    return { http: 400, corpo: { error: tamanho > VIDEO_BYTES_MAX ? 'O vídeo é grande demais. Grave pela própria página ou comprima o arquivo.' : 'O arquivo enviado está vazio ou inválido.' } };
  }
  const { data: assinada } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 60);
  let inicio: Uint8Array = new Uint8Array(0);
  try {
    if (assinada?.signedUrl) inicio = await lerInicio(assinada.signedUrl);
  } catch (e) {
    console.error('Falha ao ler o início do vídeo', e);
  }
  if (!conteudoCombinaComMime(inicio, mime)) {
    await apagarTudo(); // não é um vídeo de verdade (ou não é do formato declarado)
    return { http: 400, corpo: { error: 'O arquivo enviado não é um vídeo válido. Grave pela própria página ou escolha outro arquivo.' } };
  }
  // Condicional: só a primeira confirmação marca como enviado.
  const { data: marcado } = await admin
    .from(T)
    .update({ status: 'enviado', video_path: caminho, mime, tamanho_bytes: tamanho, duracao_s: duracaoSanitizada(entrada?.duracao_s), enviado_em: new Date(agora).toISOString() })
    .eq('id', v.id)
    .eq('status', 'solicitado')
    .select('id');
  if (!marcado || !marcado.length) return { http: 200, corpo: { ok: true, estado: 'enviado' } };
  return { http: 200, corpo: { ok: true, estado: 'enviado' } };
}

// ---------- Porta do RH ----------
async function criarPedido(
  admin: Admin,
  p: { empresaId: string; perfilId: string; candidato: { ref: string; nome: string; email: string | null }; instrucoes: string; validadeDias?: unknown; agora: number }
): Promise<{ ok: boolean; erro?: string; pedido?: any; token?: string }> {
  const dias = Number.isInteger(Number(p.validadeDias)) && Number(p.validadeDias) >= 1 ? Math.min(Number(p.validadeDias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
  const { data: existentes } = await admin.from(T).select('id, status, prazo_ate').eq('empresa_id', p.empresaId).eq('candidato_ref', p.candidato.ref).in('status', STATUS_ATIVOS);
  if ((existentes || []).some((x: any) => situacaoVideo(x, p.agora) === 'solicitado')) {
    return { ok: false, erro: 'Já existe um pedido de vídeo aberto para este candidato. Reenvie o link ou cancele o anterior.' };
  }
  const { data: jaEnviado } = await admin.from(T).select('id').eq('empresa_id', p.empresaId).eq('candidato_ref', p.candidato.ref).eq('status', 'enviado').limit(1);
  if (jaEnviado && jaEnviado.length) return { ok: false, erro: 'Este candidato já enviou o vídeo. Exclua o vídeo atual se quiser pedir outro.' };
  const { count } = await admin.from(T).select('*', { count: 'exact', head: true }).eq('empresa_id', p.empresaId).gte('criado_em', new Date(p.agora - 86400000).toISOString());
  if ((count || 0) >= MAX_PEDIDOS_POR_DIA) return { ok: false, erro: 'Limite diário de pedidos de vídeo atingido. Tente novamente amanhã.' };

  const token = gerarToken();
  const { data: criado, error } = await admin
    .from(T)
    .insert({
      empresa_id: p.empresaId,
      candidato_ref: p.candidato.ref,
      candidato_nome: p.candidato.nome,
      candidato_email: p.candidato.email,
      token_hash: await hashToken(token),
      status: 'solicitado',
      instrucoes: p.instrucoes || null,
      prazo_ate: new Date(p.agora + dias * 86400000).toISOString(),
      criado_por: p.perfilId,
    })
    .select(COLS_RESUMO)
    .single();
  if (error || !criado) return { ok: false, erro: 'Não foi possível criar o pedido de vídeo.' };
  return { ok: true, pedido: resumoVideo(criado, p.agora), token };
}

async function listarVideos(admin: Admin, empresaId: string, refs: string[], agora: number) {
  let q = admin.from(T).select(COLS_RESUMO).eq('empresa_id', empresaId);
  if (refs.length) q = q.in('candidato_ref', refs);
  const { data } = await q.order('criado_em', { ascending: false }).limit(500);
  return (data || []).map((v: any) => resumoVideo(v, agora));
}

// Link temporário (10 minutos) pra o RH assistir. Só depois de enviado.
async function assistirVideo(admin: Admin, empresaId: string, id: string) {
  const { data: v } = await admin.from(T).select('id, status, video_path, mime, duracao_s, tamanho_bytes').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!v) return { http: 404, corpo: { error: 'Vídeo não encontrado.' } };
  if (v.status !== 'enviado' || !v.video_path) return { http: 409, corpo: { error: 'Este candidato ainda não enviou o vídeo.' } };
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(v.video_path, 600);
  if (error || !data) return { http: 500, corpo: { error: 'Não foi possível abrir o vídeo agora.' } };
  return { http: 200, corpo: { ok: true, url: data.signedUrl, mime: v.mime, duracao_s: v.duracao_s ?? null, tamanho_bytes: v.tamanho_bytes === null ? null : Number(v.tamanho_bytes) } };
}

// Apaga o arquivo E o registro (LGPD: o RH pode excluir a qualquer momento, inclusive a pedido do candidato).
async function excluirVideo(admin: Admin, empresaId: string, id: string) {
  const { data: v } = await admin.from(T).select('id, empresa_id, video_path').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!v) return false;
  const pasta = `${v.empresa_id}/${v.id}`;
  const { data: arquivos } = await admin.storage.from(BUCKET).list(pasta);
  const caminhos = new Set<string>((arquivos || []).map((a: any) => `${pasta}/${a.name}`));
  if (v.video_path) caminhos.add(v.video_path);
  if (caminhos.size) await admin.storage.from(BUCKET).remove([...caminhos]);
  await admin.from(T).delete().eq('id', id).eq('empresa_id', empresaId);
  return true;
}
// ---- fim: operações --------------------------------------------------------------------------

function ipDoRequisitante(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'desconhecido';
}
async function chamadasRecentes(admin: Admin, chave: string, acao: string, minutos: number): Promise<number> {
  const desde = new Date(Date.now() - minutos * 60000).toISOString();
  const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', acao).gte('criado_em', desde);
  return count || 0;
}
// Lê só o começo do arquivo (pede os primeiros 64 bytes; se o servidor mandar tudo, lê só o primeiro pedaço e para).
async function lerInicioDoArquivo(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { Range: 'bytes=0-63' } });
  if (!r.ok || !r.body) return new Uint8Array(0);
  const leitor = r.body.getReader();
  const { value } = await leitor.read();
  await leitor.cancel();
  return value ? value.slice(0, 64) : new Uint8Array(0);
}
async function enviarEmail(para: string, assunto: string, corpoHtml: string): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ destinatario: para, assunto, corpoHtml }),
    });
    return r.ok;
  } catch (e) {
    console.error('Falha ao enviar e-mail do vídeo', e);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const agora = Date.now();

    // ================= PORTA DO CANDIDATO (sem login — só o código do link) =================
    if (action.startsWith('candidato_video_')) {
      const ip = ipDoRequisitante(req);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'video_token_invalido', 10)) >= 30) return jsonResponse({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, 429);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'video_publica', 10)) >= 200) return jsonResponse({ error: 'Muitas requisições. Aguarde alguns minutos.' }, 429);
      const token = String(body?.token || '');
      if (!TOKEN_RE.test(token)) {
        await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'video_token_invalido' });
        return jsonResponse({ error: ERRO_LINK }, 404);
      }
      await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'video_publica' });
      const resultado =
        action === 'candidato_video_abrir'
          ? await candidatoAbrir(admin, token, agora)
          : action === 'candidato_video_preparar'
            ? await candidatoPreparar(admin, token, body, agora)
            : action === 'candidato_video_confirmar'
              ? await candidatoConfirmar(admin, token, body, agora, lerInicioDoArquivo)
              : null;
      if (!resultado) return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
      if (resultado.http === 404) await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'video_token_invalido' });
      return jsonResponse(resultado.corpo, resultado.http);
    }

    // ================= PORTA DO RH (login + papel + empresa) =================
    const auth = req.headers.get('Authorization') || '';
    const principal = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const {
      data: { user },
      error: erroAuth,
    } = await principal.auth.getUser();
    if (erroAuth || !user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: perfil } = await principal.from('perfis').select('id, empresa_id, papel').eq('id', user.id).single();
    if (!perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);
    if (!['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Só o Administrador e o RH gerenciam vídeos de candidatos.' }, 403);
    const empresaId = perfil.empresa_id;
    const ehUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

    if (action === 'video_solicitar') {
      const ref = limparTexto(body?.candidato_ref);
      const nome = limparTexto(body?.candidato_nome);
      const email = limparTexto(body?.candidato_email);
      const instrucoes = limparTexto(body?.instrucoes);
      if (!ref || ref.length > 80) return jsonResponse({ error: 'Candidato inválido.' }, 400);
      if (!nome || nome.length > 120) return jsonResponse({ error: 'Informe o nome do candidato (até 120 caracteres).' }, 400);
      if (email && !emailValido(email)) return jsonResponse({ error: 'O e-mail do candidato é inválido.' }, 400);
      if (instrucoes.length > 2000) return jsonResponse({ error: 'As orientações passam de 2000 caracteres.' }, 400);
      if (body?.enviar_email === true && !email) return jsonResponse({ error: 'Para enviar por e-mail, o candidato precisa ter e-mail cadastrado.' }, 400);
      const r = await criarPedido(admin, { empresaId, perfilId: perfil.id, candidato: { ref, nome, email: email || null }, instrucoes, validadeDias: body?.validade_dias, agora });
      if (!r.ok) return jsonResponse({ error: r.erro }, 400);
      const pedido = r.pedido;
      const link = `${urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE)}video.html?t=${r.token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(email, `Vídeo de apresentação — ${empresa}`, corpoEmailVideo(nome, empresa, instrucoes, link, pedido.prazo_ate));
      }
      return jsonResponse({ ok: true, pedido, link, emailEnviado });
    }

    if (action === 'video_listar') {
      const refs = Array.isArray(body?.candidato_refs) ? body.candidato_refs.map((x: unknown) => String(x).slice(0, 80)).slice(0, 200) : [];
      return jsonResponse({ videos: await listarVideos(admin, empresaId, refs, agora) });
    }

    if (action === 'video_assistir') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Vídeo inválido.' }, 400);
      const r = await assistirVideo(admin, empresaId, body.id);
      return jsonResponse(r.corpo, r.http);
    }

    if (action === 'video_cancelar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Pedido inválido.' }, 400);
      const { data } = await admin.from(T).update({ status: 'cancelado' }).eq('id', body.id).eq('empresa_id', empresaId).eq('status', 'solicitado').select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Não foi possível cancelar (já enviado, já cancelado ou não encontrado).' }, 400);
      return jsonResponse({ ok: true });
    }

    if (action === 'video_reenviar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Pedido inválido.' }, 400);
      const { data: v } = await admin.from(T).select('*').eq('id', body.id).eq('empresa_id', empresaId).maybeSingle();
      if (!v) return jsonResponse({ error: 'Pedido não encontrado.' }, 404);
      const estado = situacaoVideo(v, agora);
      if (!['solicitado', 'expirado'].includes(estado)) return jsonResponse({ error: 'Este pedido já foi concluído ou cancelado — não dá para reenviar o link.' }, 400);
      if (body?.enviar_email === true && !v.candidato_email) return jsonResponse({ error: 'Este candidato não tem e-mail cadastrado.' }, 400);
      const dias = Number.isInteger(Number(body?.validade_dias)) && Number(body.validade_dias) >= 1 ? Math.min(Number(body.validade_dias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
      const token = gerarToken();
      const prazo = new Date(agora + dias * 86400000).toISOString();
      const { data: ok } = await admin.from(T).update({ token_hash: await hashToken(token), prazo_ate: prazo, status: 'solicitado' }).eq('id', v.id).eq('empresa_id', empresaId).in('status', ['solicitado', 'expirado']).select('id');
      if (!ok || !ok.length) return jsonResponse({ error: 'Não foi possível gerar um novo link.' }, 409);
      const link = `${urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE)}video.html?t=${token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && v.candidato_email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(v.candidato_email, `Vídeo de apresentação — ${empresa}`, corpoEmailVideo(v.candidato_nome, empresa, v.instrucoes || '', link, prazo));
      }
      return jsonResponse({ ok: true, link, emailEnviado });
    }

    if (action === 'video_excluir') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Vídeo inválido.' }, 400);
      if (!(await excluirVideo(admin, empresaId, body.id))) return jsonResponse({ error: 'Vídeo não encontrado.' }, 404);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função video-rs:', e);
    return jsonResponse({ error: 'Erro interno ao processar o vídeo.' }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode sql/42-videos-rs.sql (cria a tabela e o armazenamento privado com limite de 40 MB).
// 2) Supabase > Edge Functions > nova função: video-rs > cole este código > Deploy — com "Verify JWT" DESLIGADO
//    (ou use o deploy automático: já está no supabase/config.toml).
// 3) Precisa da função "enviar-email" (o envio do link por e-mail é opcional).
// 4) Opcional: secret URL_SITE com o endereço do site (os links usam o site em que o RH está).
// =========================================================================
