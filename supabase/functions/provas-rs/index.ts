// =========================================================================
// NORTE — Edge Function "provas-rs"
// =========================================================================
// Provas de conhecimento do processo seletivo (R&S): questões de múltipla escolha com nota
// automática. Duas "portas" na mesma função:
//
//   1) RH (Administrador e RH, com login): cria e edita provas, aplica a um candidato do funil,
//      acompanha e vê o resultado (nota, se atingiu a nota mínima, questão a questão).
//   2) CANDIDATO (sem login, só com o código do link): abre a prova, inicia, vai respondendo e
//      envia. É a página pública prova.html.
//
// Regras de ouro (cada uma tem teste):
//   - O GABARITO NUNCA SAI DO SERVIDOR pra o navegador do candidato.
//   - A correção e o CRONÔMETRO são do servidor: o candidato não consegue "dar mais tempo" nem
//     enviar uma nota.
//   - O código do candidato é aleatório (256 bits) e só o HASH dele fica no banco.
//   - Cada aplicação guarda uma CÓPIA da prova (com gabarito): editar a prova depois não muda a
//     correção de quem já fez. A ordem das questões e das alternativas é sorteada por candidato.
//   - Uma única tentativa: não dá pra iniciar de novo nem corrigir duas vezes.
//   - O resultado é APOIO à decisão do RH — a função nunca "reprova" ninguém sozinha.
//
// "Verify JWT" fica DESLIGADO (a porta do candidato não tem login): a função se protege sozinha
// (código secreto do candidato, limite por IP e, na porta do RH, login + papel + empresa).
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

const URL_SITE = (Deno.env.get('URL_SITE') || 'https://rhalley21.github.io/testes/').replace(/\/?$/, '/');

// ---- Provas: regras puras (testadas) -------------------------------------------------------

// Quanto tempo os resultados ficam guardados — o MESMO número da Política de Privacidade e da rotina diária.
const PROVAS_RETENCAO_MESES = 24;
// Folga de rede: um envio até 60s depois do tempo limite ainda é aceito (e marcado como "fora do prazo").
const TOLERANCIA_ENVIO_S = 60;
const VALIDADE_PADRAO_DIAS = 7;
const VALIDADE_MAX_DIAS = 30;
const MAX_APLICACOES_POR_DIA = 300;
const MAX_PROVAS_POR_EMPRESA = 100;
const LIMITES = { questoes: 60, alternativasMin: 2, alternativasMax: 6, titulo: 120, descricao: 1000, enunciado: 1000, alternativa: 300, pesoMax: 10, tempoMin: 5, tempoMax: 240 };
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const STATUS_ATIVOS = ['enviada', 'iniciada'];

function escaparHtml(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function limparTexto(v: unknown): string {
  return String(v ?? '').replace(/\u0000/g, '').trim();
}
function emailValido(e: unknown): boolean {
  return /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/.test(String(e ?? '')) && String(e).length <= 254;
}

// Sorteio sem viés (rejeição) — nada de Math.random() aqui: a ordem das questões e a escolha do código dependem disto.
function inteiroAleatorio(max: number): number {
  if (max <= 1) return 0;
  const limite = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limite);
  return buf[0] % max;
}
function embaralhar<T>(lista: T[], rand: (max: number) => number = inteiroAleatorio): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';
function idOpaco(usados: Set<string>, rand: (max: number) => number = inteiroAleatorio): string {
  let id = '';
  do {
    id = Array.from({ length: 8 }, () => ALFABETO[rand(ALFABETO.length)]).join('');
  } while (usados.has(id));
  usados.add(id);
  return id;
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

type AlternativaProva = { id: string; texto: string };
type QuestaoProva = { id: string; enunciado: string; alternativas: AlternativaProva[]; correta: string; peso: number };
type ProvaNormalizada = { titulo: string; descricao: string; tempo_limite_min: number; nota_minima: number; questoes: QuestaoProva[] };

// Valida e normaliza uma prova vinda do navegador (dado não confiável). Devolve a prova limpa (ids
// posicionais q1, q1a1...) ou a primeira mensagem de erro, em português, apontando a questão.
type ResultadoValidacao = { ok: boolean; erro?: string; prova?: ProvaNormalizada };
function validarProva(entrada: any): ResultadoValidacao {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const titulo = limparTexto(e.titulo);
  if (titulo.length < 3 || titulo.length > LIMITES.titulo) return { ok: false, erro: `O título precisa ter de 3 a ${LIMITES.titulo} caracteres.` };
  const descricao = limparTexto(e.descricao);
  if (descricao.length > LIMITES.descricao) return { ok: false, erro: `A descrição passa de ${LIMITES.descricao} caracteres.` };
  const tempo = Number(e.tempo_limite_min);
  if (!Number.isInteger(tempo) || tempo < LIMITES.tempoMin || tempo > LIMITES.tempoMax) return { ok: false, erro: `O tempo limite precisa ser um número inteiro de ${LIMITES.tempoMin} a ${LIMITES.tempoMax} minutos.` };
  const notaMin = e.nota_minima === undefined || e.nota_minima === null || e.nota_minima === '' ? 60 : Number(e.nota_minima);
  if (!Number.isFinite(notaMin) || notaMin < 0 || notaMin > 100) return { ok: false, erro: 'A nota mínima precisa estar entre 0 e 100.' };
  const brutas = Array.isArray(e.questoes) ? e.questoes : [];
  if (brutas.length < 1) return { ok: false, erro: 'Adicione pelo menos uma questão.' };
  if (brutas.length > LIMITES.questoes) return { ok: false, erro: `Uma prova pode ter no máximo ${LIMITES.questoes} questões.` };

  const questoes: QuestaoProva[] = [];
  for (let i = 0; i < brutas.length; i++) {
    const q = brutas[i] && typeof brutas[i] === 'object' ? brutas[i] : {};
    const n = i + 1;
    const enunciado = limparTexto(q.enunciado);
    if (enunciado.length < 5 || enunciado.length > LIMITES.enunciado) return { ok: false, erro: `Questão ${n}: o enunciado precisa ter de 5 a ${LIMITES.enunciado} caracteres.` };
    const altsBrutas = Array.isArray(q.alternativas) ? q.alternativas : [];
    if (altsBrutas.length < LIMITES.alternativasMin || altsBrutas.length > LIMITES.alternativasMax) return { ok: false, erro: `Questão ${n}: use de ${LIMITES.alternativasMin} a ${LIMITES.alternativasMax} alternativas.` };
    const textos = altsBrutas.map((a: any) => limparTexto(a && typeof a === 'object' ? a.texto : ''));
    if (textos.some((t: string) => t.length < 1 || t.length > LIMITES.alternativa)) return { ok: false, erro: `Questão ${n}: cada alternativa precisa ter de 1 a ${LIMITES.alternativa} caracteres.` };
    if (new Set(textos.map((t: string) => t.toLowerCase())).size !== textos.length) return { ok: false, erro: `Questão ${n}: há alternativas repetidas.` };
    const iCorreta = altsBrutas.findIndex((a: any) => a && typeof a === 'object' && a.id !== undefined && String(a.id) === String(q.correta));
    if (iCorreta < 0) return { ok: false, erro: `Questão ${n}: marque qual alternativa é a correta.` };
    const peso = q.peso === undefined || q.peso === null || q.peso === '' ? 1 : Number(q.peso);
    if (!Number.isInteger(peso) || peso < 1 || peso > LIMITES.pesoMax) return { ok: false, erro: `Questão ${n}: o peso precisa ser um número inteiro de 1 a ${LIMITES.pesoMax}.` };
    const id = `q${n}`;
    questoes.push({ id, enunciado, peso, alternativas: textos.map((texto: string, j: number) => ({ id: `${id}a${j + 1}`, texto })), correta: `${id}a${iCorreta + 1}` });
  }
  return { ok: true, prova: { titulo, descricao, tempo_limite_min: tempo, nota_minima: Math.round(notaMin * 100) / 100, questoes } };
}

// A cópia da prova que vai pra aplicação: ordem das questões e das alternativas sorteada e ids
// opacos (assim nem a posição nem o nome do id denunciam a alternativa certa).
type SnapshotProva = { versao: 1; titulo: string; descricao: string; questoes: QuestaoProva[] };
function montarSnapshot(prova: ProvaNormalizada, rand: (max: number) => number = inteiroAleatorio): SnapshotProva {
  const usados = new Set<string>();
  const questoes = embaralhar(prova.questoes, rand).map((q) => {
    const alts = embaralhar(q.alternativas, rand).map((a) => ({ original: a.id, id: idOpaco(usados, rand), texto: a.texto }));
    return {
      id: idOpaco(usados, rand),
      enunciado: q.enunciado,
      peso: q.peso,
      alternativas: alts.map((a) => ({ id: a.id, texto: a.texto })),
      correta: alts.find((a) => a.original === q.correta)!.id,
    };
  });
  return { versao: 1, titulo: prova.titulo, descricao: prova.descricao, questoes };
}

// O que o CANDIDATO recebe: sem o gabarito, de jeito nenhum.
function questoesParaCandidato(snapshot: SnapshotProva) {
  return snapshot.questoes.map((q) => ({ id: q.id, enunciado: q.enunciado, alternativas: q.alternativas.map((a) => ({ id: a.id, texto: a.texto })) }));
}

// Só guarda respostas de questões que existem, apontando pra alternativas que existem.
function respostasSaneadas(snapshot: SnapshotProva, respostas: unknown): Record<string, string> {
  const r = respostas && typeof respostas === 'object' ? (respostas as Record<string, unknown>) : {};
  const saida: Record<string, string> = {};
  for (const q of snapshot.questoes) {
    const dada = r[q.id];
    if (typeof dada === 'string' && q.alternativas.some((a) => a.id === dada)) saida[q.id] = dada;
  }
  return saida;
}

// Nota = pontos das questões certas / pontos possíveis (peso por questão), em % com 1 casa. Sem resposta = errada.
function corrigirProva(snapshot: SnapshotProva, respostas: unknown) {
  const validas = respostasSaneadas(snapshot, respostas);
  let pontos = 0;
  let pontosMax = 0;
  let acertos = 0;
  const detalhes = snapshot.questoes.map((q) => {
    const resposta = validas[q.id] ?? null;
    const acertou = resposta !== null && resposta === q.correta;
    pontosMax += q.peso;
    if (acertou) {
      pontos += q.peso;
      acertos++;
    }
    return { id: q.id, resposta, acertou, peso: q.peso };
  });
  const nota = pontosMax > 0 ? Math.round((pontos / pontosMax) * 1000) / 10 : 0;
  return { acertos, total: snapshot.questoes.length, pontos, pontosMax, nota, detalhes };
}

type AplicacaoBase = { status: string; prazo_ate: string; iniciada_em?: string | null; tempo_limite_min: number };
function limiteDaProvaMs(iniciadaEm: string, tempoLimiteMin: number): number {
  return Date.parse(iniciadaEm) + tempoLimiteMin * 60000;
}
function restanteSegundos(iniciadaEm: string, tempoLimiteMin: number, agora: number): number {
  return Math.max(0, Math.ceil((limiteDaProvaMs(iniciadaEm, tempoLimiteMin) - agora) / 1000));
}
function tempoEsgotado(iniciadaEm: string, tempoLimiteMin: number, agora: number): boolean {
  return agora > limiteDaProvaMs(iniciadaEm, tempoLimiteMin) + TOLERANCIA_ENVIO_S * 1000;
}
// O estado "de verdade" agora: link vencido sem ter começado = expirada; começou e passou do tempo sem enviar = tempo_esgotado
// (a correção com o que foi salvo acontece na próxima vez que alguém abrir/listar).
function situacaoEfetiva(a: AplicacaoBase, agora: number): string {
  if (a.status === 'enviada') return Date.parse(a.prazo_ate) < agora ? 'expirada' : 'enviada';
  if (a.status === 'iniciada') return a.iniciada_em && tempoEsgotado(a.iniciada_em, a.tempo_limite_min, agora) ? 'tempo_esgotado' : 'iniciada';
  return a.status;
}

// Link do e-mail: só aceita o endereço do próprio site em que o RH está (cabeçalho Origin) ou o URL_SITE configurado —
// um RH mal-intencionado não consegue mandar e-mail "nosso" com link pra outro domínio.
function urlBaseSegura(urlBase: unknown, origemRequisicao: string | null, urlSite: string): string {
  const padrao = urlSite.endsWith('/') ? urlSite : `${urlSite}/`;
  try {
    const u = new URL(String(urlBase || ''));
    const seguroProtocolo = u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
    const origemSite = new URL(padrao).origin;
    const permitido = u.origin === origemSite || (!!origemRequisicao && u.origin === origemRequisicao);
    if (!seguroProtocolo || !permitido || !/^\/[A-Za-z0-9_./-]*$/.test(u.pathname)) return padrao;
    const caminho = u.pathname.replace(/[^/]*$/, ''); // só a "pasta", sem o nome do arquivo
    return `${u.origin}${caminho}`;
  } catch {
    return padrao;
  }
}

function corpoEmailProva(nome: string, empresa: string, titulo: string, tempoMin: number, link: string, prazoISO: string): string {
  const [a, m, d] = String(prazoISO).slice(0, 10).split('-');
  return `<p>Olá, ${escaparHtml(nome)}!</p>
<p><b>${escaparHtml(empresa)}</b> convidou você para uma etapa do processo seletivo: a prova <b>${escaparHtml(titulo)}</b>.</p>
<p>Você terá <b>${tempoMin} minutos</b> para responder, a partir do momento em que clicar em "Iniciar prova". Depois de iniciada, o tempo não para, então escolha um momento tranquilo e com boa conexão. O link vale até <b>${d}/${m}/${a}</b>.</p>
<p><a href="${escaparHtml(link)}">Abrir a prova</a></p>
<p style="color:#666;">Se você não se candidatou a uma vaga nessa empresa, ignore este e-mail. O link é pessoal: não compartilhe.</p>
<p>Instituto INETRIS — plataforma de gestão de pessoas</p>`;
}
// ---- fim: regras puras ---------------------------------------------------------------------

// ---- Provas: operações no banco (recebem o cliente do banco — por isso dá pra testar o comportamento) ----
// deno-lint-ignore no-explicit-any
type Banco = any;
const T_APLIC = 'rs_provas_aplicacoes';
const COLS_RESUMO = 'id, prova_id, prova_titulo, candidato_ref, candidato_nome, candidato_email, status, prazo_ate, tempo_limite_min, nota_minima, iniciada_em, concluida_em, fora_do_prazo, acertos, total, nota, criado_em';
const ERRO_LINK = 'Este link de prova é inválido ou expirou. Peça um novo link a quem convidou você.';

// O que o RH vê de uma aplicação (nunca o código, a cópia da prova com gabarito ou as respostas cruas).
function resumoAplicacao(a: any, agora: number) {
  const concluida = a.concluida_em && a.iniciada_em ? Math.max(0, Math.round((Date.parse(a.concluida_em) - Date.parse(a.iniciada_em)) / 1000)) : null;
  return {
    id: a.id,
    prova_id: a.prova_id,
    prova_titulo: a.prova_titulo,
    candidato_ref: a.candidato_ref,
    candidato_nome: a.candidato_nome,
    candidato_email: a.candidato_email,
    status: situacaoEfetiva(a, agora),
    criado_em: a.criado_em,
    prazo_ate: a.prazo_ate,
    iniciada_em: a.iniciada_em,
    concluida_em: a.concluida_em,
    duracao_s: concluida,
    tempo_limite_min: a.tempo_limite_min,
    fora_do_prazo: !!a.fora_do_prazo,
    nota: a.nota === null || a.nota === undefined ? null : Number(a.nota),
    acertos: a.acertos ?? null,
    total: a.total ?? null,
    nota_minima: Number(a.nota_minima),
    atingiu_minima: a.nota === null || a.nota === undefined ? null : Number(a.nota) >= Number(a.nota_minima),
  };
}

async function buscarPorToken(admin: Banco, token: string) {
  const { data } = await admin.from(T_APLIC).select('*').eq('token_hash', await hashToken(token)).maybeSingle();
  return data || null;
}

// Corrige e fecha a aplicação UMA vez só (a troca de status é condicional: duas chamadas ao mesmo tempo não corrigem duas vezes).
async function finalizarAplicacao(admin: Banco, a: any, respostasBrutas: unknown, agora: number, foraDoPrazo: boolean): Promise<boolean> {
  const respostas = respostasSaneadas(a.questoes_snapshot, respostasBrutas);
  const r = corrigirProva(a.questoes_snapshot, respostas);
  const { data } = await admin
    .from(T_APLIC)
    .update({ status: 'concluida', respostas, concluida_em: new Date(agora).toISOString(), fora_do_prazo: foraDoPrazo, acertos: r.acertos, total: r.total, pontos: r.pontos, pontos_max: r.pontosMax, nota: r.nota })
    .eq('id', a.id)
    .eq('status', 'iniciada')
    .select('id');
  return !!(data && data.length);
}

async function nomeDaEmpresa(admin: Banco, empresaId: string): Promise<string> {
  const { data } = await admin.from('empresas').select('nome_fantasia').eq('id', empresaId).maybeSingle();
  return data?.nome_fantasia || 'a empresa';
}

// ---------- Porta do CANDIDATO ----------
async function visaoDoCandidato(admin: Banco, a: any, agora: number) {
  const snap: SnapshotProva = a.questoes_snapshot;
  const empresa = await nomeDaEmpresa(admin, a.empresa_id);
  const base = { ok: true, empresa, titulo: snap.titulo || a.prova_titulo, descricao: snap.descricao || '', tempoLimiteMin: a.tempo_limite_min, totalQuestoes: snap.questoes.length };
  const estado = situacaoEfetiva(a, agora);
  if (estado === 'iniciada') {
    return { ...base, estado, restanteSegundos: restanteSegundos(a.iniciada_em, a.tempo_limite_min, agora), questoes: questoesParaCandidato(snap), respostas: respostasSaneadas(snap, a.respostas) };
  }
  if (estado === 'enviada' || estado === 'concluida') return { ...base, estado };
  return { ok: true, estado, empresa, titulo: snap.titulo || a.prova_titulo }; // expirada / cancelada: sem detalhes da prova
}

async function candidatoAbrir(admin: Banco, token: string, agora: number) {
  const a = await buscarPorToken(admin, token);
  if (!a) return { http: 404, corpo: { error: ERRO_LINK } };
  if (situacaoEfetiva(a, agora) === 'tempo_esgotado') {
    await finalizarAplicacao(admin, a, a.respostas, agora, true); // o tempo acabou sem enviar: corrige com o que foi salvo
    return { http: 200, corpo: await visaoDoCandidato(admin, (await buscarPorToken(admin, token)) || a, agora) };
  }
  return { http: 200, corpo: await visaoDoCandidato(admin, a, agora) };
}

async function candidatoIniciar(admin: Banco, token: string, agora: number) {
  let a = await buscarPorToken(admin, token);
  if (!a) return { http: 404, corpo: { error: ERRO_LINK } };
  if (situacaoEfetiva(a, agora) === 'enviada') {
    // Condicional: se duas abas clicam juntas, só a primeira define a hora de início (o relógio não reinicia).
    await admin.from(T_APLIC).update({ status: 'iniciada', iniciada_em: new Date(agora).toISOString() }).eq('id', a.id).eq('status', 'enviada').select('id');
    a = (await buscarPorToken(admin, token)) || a;
  }
  if (situacaoEfetiva(a, agora) === 'tempo_esgotado') {
    await finalizarAplicacao(admin, a, a.respostas, agora, true);
    a = (await buscarPorToken(admin, token)) || a;
  }
  return { http: 200, corpo: await visaoDoCandidato(admin, a, agora) };
}

async function candidatoSalvar(admin: Banco, token: string, respostas: unknown, agora: number) {
  const a = await buscarPorToken(admin, token);
  if (!a) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoEfetiva(a, agora);
  if (estado === 'tempo_esgotado') {
    await finalizarAplicacao(admin, a, a.respostas, agora, true);
    return { http: 200, corpo: { ok: true, estado: 'concluida' } };
  }
  if (estado !== 'iniciada') return { http: 409, corpo: { error: estado === 'concluida' ? 'Esta prova já foi enviada.' : 'Esta prova não está em andamento.', estado } };
  const novas = { ...respostasSaneadas(a.questoes_snapshot, a.respostas), ...respostasSaneadas(a.questoes_snapshot, respostas) };
  await admin.from(T_APLIC).update({ respostas: novas }).eq('id', a.id).eq('status', 'iniciada');
  return { http: 200, corpo: { ok: true, estado: 'iniciada', restanteSegundos: restanteSegundos(a.iniciada_em, a.tempo_limite_min, agora) } };
}

async function candidatoEnviar(admin: Banco, token: string, respostas: unknown, agora: number) {
  const a = await buscarPorToken(admin, token);
  if (!a) return { http: 404, corpo: { error: ERRO_LINK } };
  const estado = situacaoEfetiva(a, agora);
  if (estado === 'concluida') return { http: 200, corpo: { ok: true, estado: 'concluida' } }; // reenvio: idempotente
  if (estado === 'tempo_esgotado') {
    await finalizarAplicacao(admin, a, a.respostas, agora, true); // passou da folga: vale só o que já estava salvo
    return { http: 200, corpo: { ok: true, estado: 'concluida' } };
  }
  if (estado !== 'iniciada') return { http: 409, corpo: { error: estado === 'enviada' ? 'Inicie a prova antes de enviar.' : 'Esta prova não pode mais ser enviada.', estado } };
  const juntas = { ...respostasSaneadas(a.questoes_snapshot, a.respostas), ...respostasSaneadas(a.questoes_snapshot, respostas) };
  const foraDoPrazo = agora > limiteDaProvaMs(a.iniciada_em, a.tempo_limite_min); // dentro da folga de rede, mas depois do tempo
  await finalizarAplicacao(admin, a, juntas, agora, foraDoPrazo);
  return { http: 200, corpo: { ok: true, estado: 'concluida' } };
}

// ---------- Porta do RH ----------
async function criarAplicacao(
  admin: Banco,
  p: { empresaId: string; perfilId: string; prova: any; candidato: { ref: string; nome: string; email: string | null }; validadeDias?: unknown; agora: number; rand?: (max: number) => number }
): Promise<{ ok: boolean; erro?: string; aplicacao?: any; token?: string }> {
  const dias = Number.isInteger(Number(p.validadeDias)) && Number(p.validadeDias) >= 1 ? Math.min(Number(p.validadeDias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
  const validacao = validarProva({ titulo: p.prova.titulo, descricao: p.prova.descricao, tempo_limite_min: p.prova.tempo_limite_min, nota_minima: p.prova.nota_minima, questoes: p.prova.questoes });
  if (!validacao.ok) return { ok: false, erro: `A prova está incompleta: ${validacao.erro}` };

  const { data: existentes } = await admin.from(T_APLIC).select('id, status, prazo_ate, iniciada_em, tempo_limite_min').eq('empresa_id', p.empresaId).eq('prova_id', p.prova.id).eq('candidato_ref', p.candidato.ref).in('status', STATUS_ATIVOS);
  if ((existentes || []).some((x: any) => STATUS_ATIVOS.includes(situacaoEfetiva(x, p.agora)))) {
    return { ok: false, erro: 'Já existe uma prova ativa deste modelo para este candidato. Reenvie o link ou cancele a aplicação anterior.' };
  }
  const desde = new Date(p.agora - 86400000).toISOString();
  const { count } = await admin.from(T_APLIC).select('*', { count: 'exact', head: true }).eq('empresa_id', p.empresaId).gte('criado_em', desde);
  if ((count || 0) >= MAX_APLICACOES_POR_DIA) return { ok: false, erro: 'Limite diário de provas aplicadas atingido. Tente novamente amanhã.' };

  const token = gerarToken();
  const snapshot = montarSnapshot(validacao.prova!, p.rand);
  const { data: criada, error } = await admin
    .from(T_APLIC)
    .insert({
      empresa_id: p.empresaId,
      prova_id: p.prova.id,
      prova_titulo: validacao.prova!.titulo,
      candidato_ref: p.candidato.ref,
      candidato_nome: p.candidato.nome,
      candidato_email: p.candidato.email,
      token_hash: await hashToken(token),
      status: 'enviada',
      prazo_ate: new Date(p.agora + dias * 86400000).toISOString(),
      tempo_limite_min: validacao.prova!.tempo_limite_min,
      nota_minima: validacao.prova!.nota_minima,
      questoes_snapshot: snapshot,
      criado_por: p.perfilId,
    })
    .select(COLS_RESUMO)
    .single();
  if (error || !criada) return { ok: false, erro: 'Não foi possível criar a aplicação da prova.' };
  return { ok: true, aplicacao: resumoAplicacao(criada, p.agora), token };
}

// Corrige as que começaram e passaram do tempo sem enviar (o candidato fechou a aba). Devolve quantas fechou.
async function fecharVencidas(admin: Banco, linhas: any[], agora: number): Promise<number> {
  let fechadas = 0;
  for (const l of linhas.filter((x) => situacaoEfetiva(x, agora) === 'tempo_esgotado').slice(0, 25)) {
    const { data: completa } = await admin.from(T_APLIC).select('*').eq('id', l.id).maybeSingle();
    if (completa && (await finalizarAplicacao(admin, completa, completa.respostas, agora, true))) fechadas++;
  }
  return fechadas;
}

async function listarAplicacoes(admin: Banco, empresaId: string, filtros: { candidatoRefs?: string[]; provaId?: string }, agora: number) {
  const consultar = async () => {
    let q = admin.from(T_APLIC).select(COLS_RESUMO).eq('empresa_id', empresaId);
    if (filtros.candidatoRefs && filtros.candidatoRefs.length) q = q.in('candidato_ref', filtros.candidatoRefs);
    if (filtros.provaId) q = q.eq('prova_id', filtros.provaId);
    const { data } = await q.order('criado_em', { ascending: false }).limit(500);
    return data || [];
  };
  let linhas = await consultar();
  if ((await fecharVencidas(admin, linhas, agora)) > 0) linhas = await consultar();
  return linhas.map((l: any) => resumoAplicacao(l, agora));
}

async function detalheAplicacao(admin: Banco, empresaId: string, id: string, agora: number) {
  let { data: a } = await admin.from(T_APLIC).select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!a) return null;
  if (situacaoEfetiva(a, agora) === 'tempo_esgotado' && (await finalizarAplicacao(admin, a, a.respostas, agora, true))) {
    a = (await admin.from(T_APLIC).select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle()).data;
  }
  const snap: SnapshotProva = a.questoes_snapshot;
  const dadas = respostasSaneadas(snap, a.respostas);
  const concluida = a.status === 'concluida';
  return {
    aplicacao: resumoAplicacao(a, agora),
    // O RH vê o gabarito (a prova é dele). Só depois de concluída mostra certo/errado por questão.
    questoes: snap.questoes.map((q) => ({
      id: q.id,
      enunciado: q.enunciado,
      peso: q.peso,
      alternativas: q.alternativas,
      correta: q.correta,
      resposta: dadas[q.id] ?? null,
      acertou: concluida ? dadas[q.id] === q.correta : null,
    })),
  };
}
// ---- fim: operações ------------------------------------------------------------------------

function ipDoRequisitante(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'desconhecido';
}
// Limite por IP (a porta do candidato é pública): conta as chamadas recentes numa janela.
async function chamadasRecentes(admin: Banco, chave: string, acao: string, minutos: number): Promise<number> {
  const desde = new Date(Date.now() - minutos * 60000).toISOString();
  const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', acao).gte('criado_em', desde);
  return count || 0;
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
    console.error('Falha ao enviar e-mail da prova', e);
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
    if (action.startsWith('candidato_')) {
      const ip = ipDoRequisitante(req);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'prova_token_invalido', 10)) >= 30) return jsonResponse({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, 429);
      if ((await chamadasRecentes(admin, `ip:${ip}`, 'prova_publica', 10)) >= 400) return jsonResponse({ error: 'Muitas requisições. Aguarde alguns minutos.' }, 429);
      const token = String(body?.token || '');
      if (!TOKEN_RE.test(token)) {
        await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'prova_token_invalido' });
        return jsonResponse({ error: ERRO_LINK }, 404);
      }
      await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'prova_publica' });
      const resultado =
        action === 'candidato_abrir'
          ? await candidatoAbrir(admin, token, agora)
          : action === 'candidato_iniciar'
            ? await candidatoIniciar(admin, token, agora)
            : action === 'candidato_salvar'
              ? await candidatoSalvar(admin, token, body?.respostas, agora)
              : action === 'candidato_enviar'
                ? await candidatoEnviar(admin, token, body?.respostas, agora)
                : null;
      if (!resultado) return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
      if (resultado.http === 404) await admin.from('rate_limit_log').insert({ chave: `ip:${ip}`, acao: 'prova_token_invalido' });
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
    // O gabarito é sensível: só Administrador e RH.
    if (!['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Só o Administrador e o RH gerenciam provas.' }, 403);
    const empresaId = perfil.empresa_id;
    const ehUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

    if (action === 'prova_listar') {
      const { data: provas } = await admin.from('rs_provas').select('id, titulo, descricao, tempo_limite_min, nota_minima, questoes, arquivada, criado_em, atualizado_em').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(200);
      const { data: aplic } = await admin.from(T_APLIC).select('prova_id, status').eq('empresa_id', empresaId).limit(5000);
      const contagem: Record<string, { total: number; concluidas: number }> = {};
      for (const a of aplic || []) {
        if (!a.prova_id) continue;
        const c = (contagem[a.prova_id] = contagem[a.prova_id] || { total: 0, concluidas: 0 });
        c.total++;
        if (a.status === 'concluida') c.concluidas++;
      }
      return jsonResponse({ provas: (provas || []).map((p: any) => ({ ...p, aplicacoes: contagem[p.id]?.total || 0, concluidas: contagem[p.id]?.concluidas || 0 })) });
    }

    if (action === 'prova_salvar') {
      const v = validarProva(body?.prova);
      if (!v.ok) return jsonResponse({ error: v.erro }, 400);
      const dados = { titulo: v.prova!.titulo, descricao: v.prova!.descricao || null, tempo_limite_min: v.prova!.tempo_limite_min, nota_minima: v.prova!.nota_minima, questoes: v.prova!.questoes, atualizado_em: new Date(agora).toISOString() };
      if (body?.id) {
        if (!ehUuid(body.id)) return jsonResponse({ error: 'Prova inválida.' }, 400);
        const { data, error } = await admin.from('rs_provas').update(dados).eq('id', body.id).eq('empresa_id', empresaId).select('id');
        if (error) return jsonResponse({ error: 'Não foi possível salvar a prova.' }, 500);
        if (!data || !data.length) return jsonResponse({ error: 'Prova não encontrada.' }, 404);
        return jsonResponse({ ok: true, id: body.id });
      }
      const { count } = await admin.from('rs_provas').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId);
      if ((count || 0) >= MAX_PROVAS_POR_EMPRESA) return jsonResponse({ error: `Limite de ${MAX_PROVAS_POR_EMPRESA} provas por empresa. Arquive ou exclua as que não usa mais.` }, 400);
      const { data, error } = await admin.from('rs_provas').insert({ ...dados, empresa_id: empresaId, criado_por: perfil.id }).select('id').single();
      if (error || !data) return jsonResponse({ error: 'Não foi possível salvar a prova.' }, 500);
      return jsonResponse({ ok: true, id: data.id });
    }

    if (action === 'prova_arquivar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Prova inválida.' }, 400);
      const { data } = await admin.from('rs_provas').update({ arquivada: body?.arquivada !== false, atualizado_em: new Date(agora).toISOString() }).eq('id', body.id).eq('empresa_id', empresaId).select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Prova não encontrada.' }, 404);
      return jsonResponse({ ok: true });
    }

    if (action === 'prova_excluir') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Prova inválida.' }, 400);
      const { data } = await admin.from('rs_provas').delete().eq('id', body.id).eq('empresa_id', empresaId).select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Prova não encontrada.' }, 404);
      return jsonResponse({ ok: true }); // os resultados já aplicados ficam (guardam o título e a cópia da prova)
    }

    if (action === 'aplicacao_criar') {
      if (!ehUuid(body?.prova_id)) return jsonResponse({ error: 'Escolha uma prova.' }, 400);
      const ref = limparTexto(body?.candidato_ref);
      const nome = limparTexto(body?.candidato_nome);
      const email = limparTexto(body?.candidato_email);
      if (!ref || ref.length > 80) return jsonResponse({ error: 'Candidato inválido.' }, 400);
      if (!nome || nome.length > 120) return jsonResponse({ error: 'Informe o nome do candidato (até 120 caracteres).' }, 400);
      if (email && !emailValido(email)) return jsonResponse({ error: 'O e-mail do candidato é inválido.' }, 400);
      if (body?.enviar_email === true && !email) return jsonResponse({ error: 'Para enviar por e-mail, o candidato precisa ter e-mail cadastrado.' }, 400);
      const { data: prova } = await admin.from('rs_provas').select('*').eq('id', body.prova_id).eq('empresa_id', empresaId).maybeSingle();
      if (!prova) return jsonResponse({ error: 'Prova não encontrada.' }, 404);
      if (prova.arquivada) return jsonResponse({ error: 'Esta prova está arquivada. Restaure-a para aplicar.' }, 400);
      const r = await criarAplicacao(admin, { empresaId, perfilId: perfil.id, prova, candidato: { ref, nome, email: email || null }, validadeDias: body?.validade_dias, agora });
      if (!r.ok) return jsonResponse({ error: r.erro }, 400);
      const aplicacao = r.aplicacao;
      const base = urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE);
      const link = `${base}prova.html?t=${r.token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(email, `Prova do processo seletivo — ${empresa}`, corpoEmailProva(nome, empresa, aplicacao.prova_titulo, aplicacao.tempo_limite_min, link, aplicacao.prazo_ate));
      }
      return jsonResponse({ ok: true, aplicacao, link, emailEnviado });
    }

    if (action === 'aplicacao_listar') {
      const refs = Array.isArray(body?.candidato_refs) ? body.candidato_refs.map((x: unknown) => String(x).slice(0, 80)).slice(0, 200) : [];
      const provaId = ehUuid(body?.prova_id) ? body.prova_id : undefined;
      return jsonResponse({ aplicacoes: await listarAplicacoes(admin, empresaId, { candidatoRefs: refs, provaId }, agora) });
    }

    if (action === 'aplicacao_detalhe') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Aplicação inválida.' }, 400);
      const d = await detalheAplicacao(admin, empresaId, body.id, agora);
      if (!d) return jsonResponse({ error: 'Aplicação não encontrada.' }, 404);
      return jsonResponse(d);
    }

    if (action === 'aplicacao_cancelar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Aplicação inválida.' }, 400);
      const { data } = await admin.from(T_APLIC).update({ status: 'cancelada' }).eq('id', body.id).eq('empresa_id', empresaId).in('status', ['enviada', 'iniciada', 'expirada']).select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Não foi possível cancelar (já concluída ou não encontrada).' }, 400);
      return jsonResponse({ ok: true });
    }

    if (action === 'aplicacao_reenviar') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Aplicação inválida.' }, 400);
      const { data: a } = await admin.from(T_APLIC).select('*').eq('id', body.id).eq('empresa_id', empresaId).maybeSingle();
      if (!a) return jsonResponse({ error: 'Aplicação não encontrada.' }, 404);
      const estado = situacaoEfetiva(a, agora);
      if (!['enviada', 'iniciada', 'expirada'].includes(estado)) return jsonResponse({ error: 'Esta prova já foi concluída ou cancelada — não dá para reenviar o link.' }, 400);
      if (body?.enviar_email === true && !a.candidato_email) return jsonResponse({ error: 'Este candidato não tem e-mail cadastrado.' }, 400);
      // Novo código (o anterior deixa de valer). Se o link tinha vencido sem a prova ter começado, renova a validade.
      const dias = Number.isInteger(Number(body?.validade_dias)) && Number(body.validade_dias) >= 1 ? Math.min(Number(body.validade_dias), VALIDADE_MAX_DIAS) : VALIDADE_PADRAO_DIAS;
      const token = gerarToken();
      const mudancas: Record<string, unknown> = { token_hash: await hashToken(token) };
      let prazo = a.prazo_ate;
      if (estado === 'expirada' || estado === 'enviada') {
        prazo = new Date(agora + dias * 86400000).toISOString();
        mudancas.prazo_ate = prazo;
        mudancas.status = 'enviada';
      }
      const { data: ok } = await admin.from(T_APLIC).update(mudancas).eq('id', a.id).eq('empresa_id', empresaId).in('status', ['enviada', 'iniciada', 'expirada']).select('id');
      if (!ok || !ok.length) return jsonResponse({ error: 'Não foi possível gerar um novo link.' }, 409);
      const base = urlBaseSegura(body?.url_base, req.headers.get('origin'), URL_SITE);
      const link = `${base}prova.html?t=${token}`;
      let emailEnviado = false;
      if (body?.enviar_email === true && a.candidato_email) {
        const empresa = await nomeDaEmpresa(admin, empresaId);
        emailEnviado = await enviarEmail(a.candidato_email, `Prova do processo seletivo — ${empresa}`, corpoEmailProva(a.candidato_nome, empresa, a.prova_titulo, a.tempo_limite_min, link, prazo));
      }
      return jsonResponse({ ok: true, link, emailEnviado });
    }

    if (action === 'aplicacao_excluir') {
      if (!ehUuid(body?.id)) return jsonResponse({ error: 'Aplicação inválida.' }, 400);
      const { data } = await admin.from(T_APLIC).delete().eq('id', body.id).eq('empresa_id', empresaId).select('id');
      if (!data || !data.length) return jsonResponse({ error: 'Aplicação não encontrada.' }, 404);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função provas-rs:', e);
    return jsonResponse({ error: 'Erro interno ao processar a prova.' }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode sql/40-provas-rs.sql.
// 2) Supabase > Edge Functions > nova função: provas-rs > cole este código > Deploy — com "Verify JWT" DESLIGADO
//    (ou use o deploy automático: já está no supabase/config.toml).
// 3) Precisa da função "enviar-email" já implantada (o envio do link por e-mail é opcional).
// 4) Opcional: secret URL_SITE com o endereço do site (os links dos e-mails usam o site em que o RH está).
// =========================================================================
