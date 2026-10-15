// =========================================================================
// NORTE — Edge Function "entrega-rs"
// =========================================================================
// O candidato devolve, pelo sistema, o RESULTADO de uma etapa (teste DISC/GALT, teste lógico, prova teórica ou
// prova prática): até 3 arquivos (PDF, PNG, JPG ou WEBP, 5 MB cada) e/ou um texto. Duas "portas":
//
//   1) RH (Administrador e RH, com login): pede a entrega (o link vai no e-mail da etapa), acompanha, VÊ o
//      resultado (arquivos por link temporário) e exclui.
//   2) CANDIDATO (sem login, só com o código do link): abre entrega.html, anexa e envia — UMA vez.
//
// Os arquivos NÃO passam por esta função: ela autoriza o envio de caminhos específicos e depois CONFERE o que chegou
// (existe? tamanho? o conteúdo é mesmo PDF/PNG/JPG/WEBP?). Arquivo falso, grande demais ou vazio é APAGADO.
//
// Regras (cada uma tem teste): o código do link tem 256 bits e só o HASH vai ao banco; uma única entrega por pedido;
// só Administrador e RH veem; o link de visualização dura 10 minutos; arquivos e registro são apagados depois de 6 meses.
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

// ---- Entregas: regras puras (testadas) -------------------------------------------------------

const ENTREGA_ARQUIVOS_MAX = 3;
const ENTREGA_BYTES_MAX = 5 * 1024 * 1024; // 5 MB por arquivo
const ENTREGA_BYTES_MIN = 100;
const ENTREGA_TEXTO_MAX = 3000;
const ENTREGA_RETENCAO_MESES = 6; // o MESMO número da Política de Privacidade, da rotina diária e da documentação
const VALIDADE_PADRAO_DIAS = 7;
const VALIDADE_MAX_DIAS = 30;
const MAX_PEDIDOS_POR_DIA = 300;
const BUCKET = 'entregas-candidatos';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MIMES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const ETAPAS: Record<string, string> = { disc_galt: 'Teste DISC e GALT', teste_logico: 'Teste lógico', prova_teorica: 'Prova teórica', prova_pratica: 'Prova prática' };

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
function mimeBase(m: unknown): string {
  return String(m ?? '').split(';')[0].trim().toLowerCase();
}

// Nome do arquivo como o candidato o conhece, só para exibir ao RH: sem pastas, sem caracteres de controle, até 80.
function nomeSanitizado(n: unknown): string {
  const base = String(n ?? '').split('\u0000').join('').split(/[\\/]/).pop() || '';
  const limpo = base.replace(/[\u0001-\u001f\u007f<>"|?*]/g, '').trim().slice(0, 80);
  return limpo || 'arquivo';
}

// O que o candidato diz que vai enviar: no máximo 3 arquivos, formatos permitidos, tamanho dentro do limite.
function validarArquivosDeclarados(entrada: unknown, conferirTamanho = true): { ok: boolean; erro?: string; itens: { indice: number; mime: string; ext: string; tamanho: number; nome: string }[] } {
  const lista = Array.isArray(entrada) ? entrada : [];
  if (lista.length > ENTREGA_ARQUIVOS_MAX) return { ok: false, erro: `Envie no máximo ${ENTREGA_ARQUIVOS_MAX} arquivos.`, itens: [] };
  const itens: { indice: number; mime: string; ext: string; tamanho: number; nome: string }[] = [];
  for (let i = 0; i < lista.length; i++) {
    const a: any = lista[i] && typeof lista[i] === 'object' ? lista[i] : {};
    const mime = mimeBase(a.mime);
    if (!MIMES[mime]) return { ok: false, erro: 'Formato não aceito. Envie PDF, PNG, JPG ou WEBP.', itens: [] };
    const tamanho = Number(a.tamanho);
    if (conferirTamanho && (!Number.isInteger(tamanho) || tamanho < ENTREGA_BYTES_MIN)) return { ok: false, erro: 'Um dos arquivos parece vazio ou inválido.', itens: [] };
    if (conferirTamanho && tamanho > ENTREGA_BYTES_MAX) return { ok: false, erro: `Cada arquivo pode ter até ${Math.round(ENTREGA_BYTES_MAX / 1048576)} MB.`, itens: [] };
    itens.push({ indice: i + 1, mime, ext: MIMES[mime], tamanho, nome: nomeSanitizado(a.nome) });
  }
  return { ok: true, itens };
}

// Tipo REAL pelos primeiros bytes: PDF, PNG, JPEG e WEBP.
function mimePeloConteudo(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
function conteudoCombinaComMime(bytes: Uint8Array, mime: string): boolean {
  const real = mimePeloConteudo(bytes);
  return !!real && real === mimeBase(mime);
}

function textoSanitizado(t: unknown): string {
  return limparTexto(t).slice(0, ENTREGA_TEXTO_MAX);
}
function situacaoEntrega(v: { status: string; prazo_ate: string }, agora: number): string {
  if (v.status === 'solicitado' && Date.parse(v.prazo_ate) < agora) return 'expirado';
  return v.status;
}
function caminhoDoArquivo(empresaId: string, id: string, indice: number, ext: string): string {
  return `${empresaId}/${id}/arquivo-${indice}.${ext}`;
}
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
function corpoEmailEntrega(nome: string, empresa: string, etapa: string, link: string, prazoISO: string): string {
  const [a, m, d] = String(prazoISO).slice(0, 10).split('-');
  return `<p>Olá, ${escaparHtml(nome)}!</p>
<p><b>${escaparHtml(empresa)}</b> pediu o resultado da etapa <b>${escaparHtml(etapa)}</b> do processo seletivo.</p>
<p>Quando terminar, envie o resultado (PDF, imagem ou texto) pelo link abaixo. Você pode enviar até ${ENTREGA_ARQUIVOS_MAX} arquivos de até ${Math.round(ENTREGA_BYTES_MAX / 1048576)} MB. O link vale até <b>${d}/${m}/${a}</b>.</p>
<p><a href="${escaparHtml(link)}">Enviar meu resultado</a></p>
<p style="color:#666;">O resultado será visto apenas pela equipe de recrutamento da empresa e guardado por até ${ENTREGA_RETENCAO_MESES} meses. O link é pessoal: não compartilhe.</p>
<p>Instituto INETRIS — plataforma de gestão de pessoas</p>`;
}
// ---- fim: regras puras -----------------------------------------------------------------------

// ---- Entregas: operações (recebem o banco e o armazenamento — por isso dá pra testar o comportamento) ----
// deno-lint-ignore no-explicit-any
type Admin = any;
const T = 'rs_entregas';
const COLS_RESUMO = 'id, candidato_ref, candidato_nome, candidato_email, etapa, status, prazo_ate, arquivos, texto_resposta, enviado_em, criado_em';
const ERRO_LINK = 'Este link é inválido ou expirou. Peça um novo link a quem convidou você.';

function resumoEntrega(v: any, agora: number) {
  return {
    id: v.id,
    candidato_ref: v.candidato_ref,
    candidato_nome: v.candidato_nome,
    candidato_email: v.candidato_email,
    etapa: v.etapa,
    status: situacaoEntrega(v, agora),
    prazo_ate: v.prazo_ate,
    enviado_em: v.enviado_em,
    criado_em: v.criado_em,
    qtd_arquivos: Array.isArray(v.arquivos) ? v.arquivos.length : 0,
    tem_texto: !!v.texto_resposta,
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
async function candidatoAbrir(admin: Admin, token: string, agora: number) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoEntrega(v, agora);
  const base = { ok: true, estado, empresa: await nomeDaEmpresa(admin, v.empresa_id), etapa: ETAPAS[v.etapa] || 'Etapa' };
  if (estado !== 'solicitado') return { http: 200, corpo: base };
  return { http: 200, corpo: { ...base, instrucoes: v.instrucoes || '', limites: { arquivos: ENTREGA_ARQUIVOS_MAX, bytes: ENTREGA_BYTES_MAX, texto: ENTREGA_TEXTO_MAX, retencaoMeses: ENTREGA_RETENCAO_MESES } } };
}

// Autoriza o envio: um caminho de envio por arquivo declarado (todos dentro do pedido).
async function candidatoPreparar(admin: Admin, token: string, entrada: any, agora: number) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoEntrega(v, agora);
  if (estado !== 'solicitado') return { http: 409, corpo: { error: estado === 'enviado' ? 'Seu resultado já foi enviado. Obrigado!' : 'Este pedido não está mais aberto.', estado } };
  const val = validarArquivosDeclarados(entrada?.arquivos);
  if (!val.ok) return { http: 400, corpo: { error: val.erro } };
  const envios = [];
  for (const item of val.itens) {
    const caminho = caminhoDoArquivo(v.empresa_id, v.id, item.indice, item.ext);
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho, { upsert: true });
    if (error || !data) return { http: 500, corpo: { error: 'Não foi possível preparar o envio agora. Tente de novo.' } };
    envios.push({ indice: item.indice, caminho, token: data.token, mime: item.mime });
  }
  return { http: 200, corpo: { ok: true, envios } };
}

// Confere o que chegou (existe? tamanho? é do tipo declarado?) e só então marca como enviado. Qualquer problema apaga TUDO.
async function candidatoConfirmar(admin: Admin, token: string, entrada: any, agora: number, lerInicio: (url: string) => Promise<Uint8Array>) {
  const v = await buscarPorToken(admin, token);
  if (!v) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoEntrega(v, agora);
  if (estado === 'enviado') return { http: 200, corpo: { ok: true, estado: 'enviado' } };
  if (estado !== 'solicitado') return { http: 409, corpo: { error: 'Este pedido não está mais aberto.', estado } };

  // na confirmação o tamanho que vale é o REAL (conferido no armazenamento abaixo), não o que o navegador disse
  const val = validarArquivosDeclarados(entrada?.arquivos, false);
  if (!val.ok) return { http: 400, corpo: { error: val.erro } };
  const texto = textoSanitizado(entrada?.texto);
  if (!val.itens.length && !texto) return { http: 400, corpo: { error: 'Envie pelo menos um arquivo ou escreva o resultado.' } };

  const pasta = `${v.empresa_id}/${v.id}`;
  const { data: existentes } = await admin.storage.from(BUCKET).list(pasta);
  const naPasta = (existentes || []) as { name: string; metadata?: { size?: number } }[];
  const apagarTudo = async () => {
    if (naPasta.length) await admin.storage.from(BUCKET).remove(naPasta.map((a) => `${pasta}/${a.name}`));
  };
  const esperados = new Map(val.itens.map((i) => [`arquivo-${i.indice}.${i.ext}`, i]));
  // arquivo que ninguém declarou (sobra de tentativa com outro formato) é apagado; os declarados precisam existir
  const sobras = naPasta.filter((a) => !esperados.has(a.name));
  if (sobras.length) await admin.storage.from(BUCKET).remove(sobras.map((a) => `${pasta}/${a.name}`));
  const salvos = [];
  for (const [nomeNaPasta, item] of esperados) {
    const arq = naPasta.find((a) => a.name === nomeNaPasta);
    if (!arq) {
      await apagarTudo();
      return { http: 400, corpo: { error: `O arquivo "${item.nome}" não chegou. Tente enviar de novo.` } };
    }
    const tamanho = Number(arq.metadata?.size ?? 0);
    if (tamanho < ENTREGA_BYTES_MIN || tamanho > ENTREGA_BYTES_MAX) {
      await apagarTudo();
      return { http: 400, corpo: { error: `O arquivo "${item.nome}" está vazio ou passa de ${Math.round(ENTREGA_BYTES_MAX / 1048576)} MB.` } };
    }
    const caminho = `${pasta}/${nomeNaPasta}`;
    const { data: assinada } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 60);
    let inicio: Uint8Array = new Uint8Array(0);
    try {
      if (assinada?.signedUrl) inicio = await lerInicio(assinada.signedUrl);
    } catch (e) {
      console.error('Falha ao ler o início do arquivo', e);
    }
    const mimeReal = Object.keys(MIMES).find((m) => MIMES[m] === item.ext)!;
    if (!conteudoCombinaComMime(inicio, mimeReal)) {
      await apagarTudo();
      return { http: 400, corpo: { error: `O arquivo "${item.nome}" não é um ${item.ext.toUpperCase()} válido. Envie outro arquivo.` } };
    }
    salvos.push({ nome: item.nome, mime: mimeReal, tamanho, caminho });
  }
  const { data: marcado } = await admin.from(T).update({ status: 'enviado', arquivos: salvos, texto_resposta: texto || null, enviado_em: new Date(agora).toISOString() }).eq('id', v.id).eq('status', 'solicitado').select('id');
  void marcado; // se outra confirmação chegou primeiro, o resultado é o mesmo: já está enviado
  return { http: 200, corpo: { ok: true, estado: 'enviado' } };
}

// ---------- Porta do RH ----------
async function criarPedido(
  admin: Admin,
  p: { empresaId: string; perfilId: string; candidato: { ref: string; nome: string; email: string | null }; etapa: string; instrucoes: string; validadeDias?: unknown; agora: number }
): Promise<{ ok: boolean; erro?: string; jaEnviado?: boolean; pedido?: any; token?: string }> {
  if (!ETAPAS[p.etapa]) return { ok: false, erro: 'Esta etapa não recebe resultado do candidato.' };
  const dias = Number.isInteger(Number(p.validadeDias)) && Number(p.validadeDias) >= 1 ? Math.min(Number(p.validadeDias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
  const { data: anteriores } = await admin.from(T).select('id, status, prazo_ate').eq('empresa_id', p.empresaId).eq('candidato_ref', p.candidato.ref).eq('etapa', p.etapa);
  if ((anteriores || []).some((x: any) => x.status === 'enviado')) return { ok: false, jaEnviado: true, erro: 'Este candidato já enviou o resultado desta etapa.' };
  // voltar para a etapa gera um link novo: o pedido aberto anterior deixa de valer
  await admin.from(T).update({ status: 'cancelado' }).eq('empresa_id', p.empresaId).eq('candidato_ref', p.candidato.ref).eq('etapa', p.etapa).eq('status', 'solicitado');
  const { count } = await admin.from(T).select('*', { count: 'exact', head: true }).eq('empresa_id', p.empresaId).gte('criado_em', new Date(p.agora - 86400000).toISOString());
  if ((count || 0) >= MAX_PEDIDOS_POR_DIA) return { ok: false, erro: 'Limite diário de pedidos atingido. Tente novamente amanhã.' };
  const token = gerarToken();
  const { data: criado, error } = await admin
    .from(T)
    .insert({ empresa_id: p.empresaId, candidato_ref: p.candidato.ref, candidato_nome: p.candidato.nome, candidato_email: p.candidato.email, etapa: p.etapa, token_hash: await hashToken(token), status: 'solicitado', instrucoes: p.instrucoes || null, prazo_ate: new Date(p.agora + dias * 86400000).toISOString(), criado_por: p.perfilId })
    .select(COLS_RESUMO)
    .single();
  if (error || !criado) return { ok: false, erro: 'Não foi possível criar o pedido.' };
  return { ok: true, pedido: resumoEntrega(criado, p.agora), token };
}

async function listarEntregas(admin: Admin, empresaId: string, refs: string[], agora: number) {
  let q = admin.from(T).select(COLS_RESUMO).eq('empresa_id', empresaId);
  if (refs.length) q = q.in('candidato_ref', refs);
  const { data } = await q.order('criado_em', { ascending: false }).limit(500);
  return (data || []).map((v: any) => resumoEntrega(v, agora));
}

// O resultado para o RH: o texto e os arquivos por link temporário (10 minutos). Nunca devolve o caminho interno.
async function verEntrega(admin: Admin, empresaId: string, id: string) {
  const { data: v } = await admin.from(T).select('id, status, texto_resposta, arquivos, etapa').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!v) return { http: 404, corpo: { error: 'Resultado não encontrado.' } };
  if (v.status !== 'enviado') return { http: 409, corpo: { error: 'Este candidato ainda não enviou o resultado.' } };
  const arquivos = [];
  for (const a of Array.isArray(v.arquivos) ? v.arquivos : []) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(a.caminho, 600);
    arquivos.push({ nome: a.nome, mime: a.mime, tamanho: a.tamanho, url: data?.signedUrl || null });
  }
  return { http: 200, corpo: { ok: true, etapa: ETAPAS[v.etapa] || v.etapa, texto: v.texto_resposta || '', arquivos } };
}

async function excluirEntrega(admin: Admin, empresaId: string, id: string) {
  const { data: v } = await admin.from(T).select('id, empresa_id, arquivos').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!v) return false;
  const pasta = `${v.empresa_id}/${v.id}`;
  const { data: naPasta } = await admin.storage.from(BUCKET).list(pasta);
  const caminhos = new Set<string>((naPasta || []).map((a: any) => `${pasta}/${a.name}`));
  for (const a of Array.isArray(v.arquivos) ? v.arquivos : []) if (a.caminho) caminhos.add(a.caminho);
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
    console.error('Falha ao enviar e-mail da entrega', e);
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
    if (action.startsWith('candidato_entrega_')) {
      const ip = ipDoRequisitante(req);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'entrega_token_invalido', 10)) >= 30) return jsonResponse({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, 429);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'entrega_publica', 10)) >= 200) return jsonResponse({ error: 'Muitas requisições. Aguarde alguns minutos.' }, 429);
      const token = String(body?.token || '');
      if (!TOKEN_RE.test(token)) {
        await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'entrega_token_invalido' });
        return jsonResponse({ error: ERRO_LINK }, 404);
      }
      await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'entrega_publica' });
      const resultado =
        action === 'candidato_entrega_abrir'
          ? await candidatoAbrir(admin, token, agora)
          : action === 'candidato_entrega_preparar'
            ? await candidatoPreparar(admin, token, body, agora)
            : action === 'candidato_entrega_confirmar'
              ? await candidatoConfirmar(admin, token, body, agora, lerInicioDoArquivo)
              : null;
      if (!resultado) return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
      if (resultado.http === 404) await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'entrega_token_invalido' });
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
    if (!['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Só o Administrador e o RH gerenciam os resultados dos candidatos.' }, 403);
    const empresaId = perfil.empresa_id;
    const ehUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

    if (action === 'entrega_solicitar') {
      const ref = limparTexto(body?.candidato_ref);
      const nome = limparTexto(body?.candidato_nome);
      const email = limparTexto(body?.candidato_email);
      const instrucoes = limparTexto(body?.instrucoes);
      if (!ref || ref.length > 80) return jsonResponse({ error: 'Candidato inválido.' }, 400);
      if (!nome || nome.length > 120) return jsonResponse({ error: 'Informe o nome do candidato (até 120 caracteres).' }, 400);
      if (email && !emailValido(email)) return jsonResponse({ error: 'O e-mail do candidato é inválido.' }, 400);
      if (instrucoes.length > 2000) return jsonResponse({ error: 'As orientações passam de 2000 caracteres.' }, 400);
      const r = await criarPedido(admin, { empresaId, perfilId: perfil.id, candidato: { ref, nome, email: email || null }, etapa: String(body?.etapa || ''), instrucoes, validadeDias: body?.validade_dias, agora });
      if (!r.ok) return jsonResponse({ error: r.erro, jaEnviado: !!r.jaEnviado }, r.jaEnviado ? 409 : 400);
      const link = `${urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE)}entrega.html?t=${r.token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(email, `Enviar resultado — ${ETAPAS[String(body.etapa)]}`, corpoEmailEntrega(nome, empresa, ETAPAS[String(body.etapa)], link, r.pedido.prazo_ate));
      }
      return jsonResponse({ ok: true, pedido: r.pedido, link, emailEnviado });
    }

    if (action === 'entrega_listar') {
      const refs = Array.isArray(body?.candidato_refs) ? body.candidato_refs.map((x: unknown) => String(x).slice(0, 80)).slice(0, 200) : [];
      return jsonResponse({ entregas: await listarEntregas(admin, empresaId, refs, agora) });
    }

    if (action === 'entrega_ver') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Resultado inválido.' }, 400);
      const r = await verEntrega(admin, empresaId, body.id);
      return jsonResponse(r.corpo, r.http);
    }

    if (action === 'entrega_cancelar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Pedido inválido.' }, 400);
      const { data } = await admin.from(T).update({ status: 'cancelado' }).eq('id', body.id).eq('empresa_id', empresaId).eq('status', 'solicitado').select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Não foi possível cancelar (já enviado, já cancelado ou não encontrado).' }, 400);
      return jsonResponse({ ok: true });
    }

    if (action === 'entrega_reenviar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Pedido inválido.' }, 400);
      const { data: v } = await admin.from(T).select('*').eq('id', body.id).eq('empresa_id', empresaId).maybeSingle();
      if (!v) return jsonResponse({ error: 'Pedido não encontrado.' }, 404);
      const estado = situacaoEntrega(v, agora);
      if (!['solicitado', 'expirado'].includes(estado)) return jsonResponse({ error: 'Este pedido já foi concluído ou cancelado — não dá para reenviar o link.' }, 400);
      if (body?.enviar_email === true && !v.candidato_email) return jsonResponse({ error: 'Este candidato não tem e-mail cadastrado.' }, 400);
      const dias = Number.isInteger(Number(body?.validade_dias)) && Number(body.validade_dias) >= 1 ? Math.min(Number(body.validade_dias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
      const token = gerarToken();
      const prazo = new Date(agora + dias * 86400000).toISOString();
      const { data: ok } = await admin.from(T).update({ token_hash: await hashToken(token), prazo_ate: prazo, status: 'solicitado' }).eq('id', v.id).eq('empresa_id', empresaId).in('status', ['solicitado', 'expirado']).select('id');
      if (!ok || !ok.length) return jsonResponse({ error: 'Não foi possível gerar um novo link.' }, 409);
      const link = `${urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE)}entrega.html?t=${token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && v.candidato_email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(v.candidato_email, `Enviar resultado — ${ETAPAS[v.etapa]}`, corpoEmailEntrega(v.candidato_nome, empresa, ETAPAS[v.etapa], link, prazo));
      }
      return jsonResponse({ ok: true, link, emailEnviado });
    }

    if (action === 'entrega_excluir') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Resultado inválido.' }, 400);
      if (!(await excluirEntrega(admin, empresaId, body.id))) return jsonResponse({ error: 'Resultado não encontrado.' }, 404);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função entrega-rs:', e);
    return jsonResponse({ error: 'Erro interno ao processar o resultado.' }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode sql/43-entregas-rs.sql (tabela + armazenamento privado com limite de 5 MB por arquivo).
// 2) Supabase > Edge Functions > nova função: entrega-rs > cole este código > Deploy — com "Verify JWT" DESLIGADO
//    (ou use o deploy automático: já está no supabase/config.toml).
// 3) Precisa da função "enviar-email" (só para reenviar o link por e-mail; o link vai no e-mail da etapa).
// 4) Opcional: secret URL_SITE com o endereço do site (os links usam o site em que o RH está).
// =========================================================================
