// =========================================================================
// NORTE — Edge Function "rs"
// =========================================================================
// Duas categorias de ação:
//  - PÚBLICAS (sem login): 'vaga_publica' e 'candidatura_criar' — quem
//    chama é um visitante qualquer, na página pública de candidatura.
//  - AUTENTICADAS (RH/owner): publicar/desativar a vaga pública, listar e
//    importar candidaturas pro pipeline, listar banco de talentos, baixar
//    currículo.
//
// As tabelas rs_vagas_publicas / rs_candidaturas_publicas /
// rs_banco_talentos não têm nenhuma política de acesso direto — só esta
// função (com a chave de serviço) toca nelas. Isso é o que permite receber
// candidatura de gente sem login SEM abrir o resto do banco pra internet.
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

async function validarRecaptcha(token: string): Promise<boolean> {
  const secret = Deno.env.get('RECAPTCHA_SECRET_KEY');
  if (!secret || !token) return false;
  try {
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${secret}&response=${token}`,
    });
    const data = await resp.json();
    return !!data.success;
  } catch {
    return false;
  }
}

const ACOES_PUBLICAS = ['vaga_publica', 'candidatura_criar'];

// Confere quantas tentativas essa chave (normalmente o IP) já fez pra essa
// ação na janela de tempo — se já bateu no limite, recusa. Senão, registra
// mais uma tentativa e deixa passar (ver sql/35-rate-limit.sql).
async function dentroDoLimite(admin: any, chave: string, acao: string, maxTentativas: number, janelaHoras: number): Promise<boolean> {
  const desde = new Date(Date.now() - janelaHoras * 3600000).toISOString();
  const { count } = await admin.from('rate_limit_log').select('*', { count: 'exact', head: true }).eq('chave', chave).eq('acao', acao).gte('criado_em', desde);
  if ((count || 0) >= maxTentativas) return false;
  await admin.from('rate_limit_log').insert({ chave, acao });
  return true;
}

function ipDoRequisitante(req: Request): string {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'desconhecido';
}

// ---- Entrada do formulário PÚBLICO de candidatura: dado não confiável -----------
// UM endereço de e-mail simples (sem espaço, vírgula, ponto-e-vírgula, <>, aspas).
function emailValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]{2,}$/.test(v);
}
// O nome do candidato vai pro HTML do e-mail de confirmação: sem escape, alguém poderia
// mandar um e-mail da INETRIS, pro endereço de qualquer pessoa, com links à escolha.
function escaparHtml(t: unknown): string {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// O "perfil" do candidato é um JSON vindo do navegador: só passam os campos que o
// formulário realmente tem, com o tipo certo e tamanho limitado (antes, qualquer
// JSON, de qualquer tamanho, era gravado como veio).
const PERFIL_CAMPOS_TEXTO: Record<string, number> = {
  cidadeAtual: 120,
  formacaoSuperior: 60,
  experienciaAnteriorFuncao: 1000,
  disponibilidadeHorarios: 60,
  intimidadeTecnologia: 60,
  linkedin: 200,
  conhecimentoExcel: 60,
  conhecimentoWord: 60,
  conhecimentoPowerpoint: 60,
};
const PERFIL_CAMPOS_BOOL = ['maior18', 'possuiMoto', 'possuiNotebook', 'possuiSmartphone'];
function sanitizarPerfilCandidato(bruto: unknown): Record<string, string | boolean> {
  const saida: Record<string, string | boolean> = {};
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return saida;
  const p = bruto as Record<string, unknown>;
  for (const k of PERFIL_CAMPOS_BOOL) if (typeof p[k] === 'boolean') saida[k] = p[k] as boolean;
  for (const [k, max] of Object.entries(PERFIL_CAMPOS_TEXTO)) if (typeof p[k] === 'string') saida[k] = (p[k] as string).trim().slice(0, max);
  return saida;
}

// ---- Banco de talentos ----------------------------------------------------------
// Prazo que o candidato aceita: "por até N meses". É o MESMO número do texto do
// formulário (vaga.html) e da Política de Privacidade — um teste confere os três.
const BANCO_TALENTOS_MESES = 24;

function mesesAtras(agora: number, meses: number): string {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString();
}
function mesesDepois(iso: string, meses: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString();
}

type LinhaTalento = { id: string; candidatura_id: string | null; nome: string; email: string; telefone: string | null; curriculo_path: string | null; criado_em: string };

// A mesma pessoa que se candidata a várias vagas (autorizando o banco de talentos em
// cada uma) gera várias linhas: aqui vira UMA entrada, com os dados mais recentes. O
// prazo conta da autorização mais recente (quem autorizou de novo renovou o consentimento).
function agruparTalentos(linhas: LinhaTalento[]) {
  const grupos = new Map<string, LinhaTalento[]>();
  for (const l of linhas) {
    const chave = String(l.email || '').trim().toLowerCase();
    if (!chave) continue;
    (grupos.get(chave) || grupos.set(chave, []).get(chave)!).push(l);
  }
  const saida = Array.from(grupos.entries()).map(([chave, itens]) => {
    const ordenadas = [...itens].sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em)); // mais recente primeiro
    const maisRecente = ordenadas[0];
    return {
      chave,
      ids: ordenadas.map((l) => l.id),
      nome: maisRecente.nome,
      email: maisRecente.email,
      telefone: ordenadas.find((l) => l.telefone)?.telefone || null,
      idCurriculo: ordenadas.find((l) => l.curriculo_path)?.id || null,
      candidaturaIds: ordenadas.map((l) => l.candidatura_id).filter((x): x is string => !!x),
      entrouEm: maisRecente.criado_em,
      primeiraEm: ordenadas[ordenadas.length - 1].criado_em,
    };
  });
  return saida.sort((a, b) => Date.parse(b.entrouEm) - Date.parse(a.entrouEm));
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ---- fim: banco de talentos ------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ---------------------------------------------------------------------
    // AÇÕES PÚBLICAS — sem exigir sessão logada.
    // ---------------------------------------------------------------------
    if (action === 'vaga_publica') {
      const { data, error } = await admin
        .from('rs_vagas_publicas')
        .select('id, titulo, descricao, requisitos, local, modalidade, mostrar_salario, faixa_salarial, mostrar_empresa, nome_empresa_exibicao, jovem_aprendiz, ativa')
        .eq('id', body.vagaPublicaId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      if (!data || !data.ativa) return jsonResponse({ error: 'Vaga não encontrada ou encerrada.' }, 404);
      return jsonResponse({ vaga: data });
    }

    if (action === 'candidatura_criar') {
      // No máximo 10 candidaturas por IP a cada 1h — dá espaço de sobra pra
      // alguém se candidatar a várias vagas, mas barra envio em massa.
      if (!(await dentroDoLimite(admin, ipDoRequisitante(req), 'candidatura_rs', 10, 1))) {
        return jsonResponse({ error: 'Muitas candidaturas enviadas deste endereço em pouco tempo. Tente novamente mais tarde.' }, 429);
      }
      const recaptchaOk = await validarRecaptcha(body.recaptchaToken);
      if (!recaptchaOk) {
        return jsonResponse({ error: 'Não foi possível confirmar que você não é um robô. Tente novamente.' }, 400);
      }
      const nome = String(body.nome || '').trim().slice(0, 120);
      const email = String(body.email || '').trim();
      const telefone = String(body.telefone || '').trim().slice(0, 40);
      if (!nome || !email) {
        return jsonResponse({ error: 'Nome e e-mail são obrigatórios.' }, 400);
      }
      if (!emailValido(email)) {
        return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
      }
      if (!body.curriculoBase64) {
        return jsonResponse({ error: 'Anexe o currículo em PDF.' }, 400);
      }
      if (!body.aceitePrivacidade) {
        return jsonResponse({ error: 'É necessário aceitar o aviso de privacidade.' }, 400);
      }
      const { data: vaga } = await admin.from('rs_vagas_publicas').select('id, empresa_id, ativa').eq('id', body.vagaPublicaId).maybeSingle();
      if (!vaga || !vaga.ativa) return jsonResponse({ error: 'Esta vaga não está mais recebendo candidaturas.' }, 409);

      // Currículo: obrigatório, PDF, limite de tamanho (5MB em base64 ~ 6.7MB de texto).
      // BUG DE SEGURANÇA CORRIGIDO: antes, só confiávamos no content-type que
      // o navegador declarava — alguém podia renomear qualquer arquivo pra
      // ".pdf" e o sistema aceitava sem checar. Agora confere a "assinatura"
      // real do arquivo: todo PDF de verdade começa com os bytes %PDF- —
      // se não bater, recusa a candidatura inteira (não é só ignorado em
      // silêncio, já que o currículo é obrigatório).
      let curriculoPath: string | null = null;
      if (body.curriculoBase64) {
        const base64 = String(body.curriculoBase64).split(',').pop() || '';
        if (base64.length > 7_000_000) {
          return jsonResponse({ error: 'Currículo muito grande (máximo 5MB).' }, 400);
        }
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        } catch {
          return jsonResponse({ error: 'Não foi possível ler o arquivo do currículo. Tente anexar de novo.' }, 400);
        }
        const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
        const ehPdfDeVerdade = ASSINATURA_PDF.every((b, i) => bytes[i] === b);
        if (!ehPdfDeVerdade) {
          return jsonResponse({ error: 'O arquivo enviado não é um PDF válido. Verifique e tente novamente.' }, 400);
        }
        const nome = `${vaga.empresa_id}/${vaga.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
        const up = await admin.storage.from('curriculos-rs').upload(nome, bytes, { contentType: 'application/pdf', upsert: false });
        if (up.error) {
          console.error('Falha ao subir currículo', up.error);
          return jsonResponse({ error: 'Não foi possível salvar o currículo. Tente novamente.' }, 500);
        }
        curriculoPath = nome;
      }

      const { data: candidatura, error: erroCand } = await admin
        .from('rs_candidaturas_publicas')
        .insert({
          vaga_publica_id: body.vagaPublicaId,
          empresa_id: vaga.empresa_id,
          nome,
          email,
          telefone: telefone || null,
          curriculo_path: curriculoPath,
          aceite_privacidade: true,
          aceite_banco_talentos: !!body.aceiteBancoTalentos,
          perfil: sanitizarPerfilCandidato(body.perfil),
        })
        .select('id')
        .single();
      if (erroCand) return jsonResponse({ error: erroCand.message }, 500);

      if (body.aceiteBancoTalentos) {
        await admin.from('rs_banco_talentos').insert({
          empresa_id: vaga.empresa_id,
          candidatura_id: candidatura.id,
          nome,
          email,
          telefone: telefone || null,
          curriculo_path: curriculoPath,
        });
      }

      // Confirmação por e-mail na hora — a pessoa não deveria ficar sem
      // saber se a candidatura foi recebida até o RH decidir importar.
      // Best-effort: se o envio falhar, a candidatura já está salva de
      // qualquer forma, então não bloqueia a resposta pro visitante.
      try {
        const { data: vagaInfo } = await admin.from('rs_vagas_publicas').select('titulo').eq('id', body.vagaPublicaId).maybeSingle();
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            destinatario: email,
            assunto: 'Recebemos sua candidatura',
            corpoHtml: `<p>Olá, ${escaparHtml(nome)}!</p><p>Recebemos sua candidatura para a vaga <b>${escaparHtml(vagaInfo?.titulo || 'divulgada')}</b>. Nossa equipe vai analisar seu perfil e você será avisado(a) por e-mail a cada atualização.</p>`,
          }),
        });
      } catch (e) {
        console.warn('Falha ao enviar e-mail de confirmação de candidatura', e);
      }

      return jsonResponse({ protocolo: candidatura.id });
    }

    // ---------------------------------------------------------------------
    // A partir daqui, todas as ações exigem sessão logada (RH/owner).
    // ---------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') || '';
    const principal = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: erroAuth,
    } = await principal.auth.getUser();
    if (erroAuth || !user) return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: perfil, error: erroPerfil } = await principal.from('perfis').select('id, empresa_id, papel').eq('id', user.id).single();
    if (erroPerfil || !perfil) return jsonResponse({ error: 'Perfil não encontrado.' }, 403);
    if (!['owner', 'rh'].includes(perfil.papel)) return jsonResponse({ error: 'Sem permissão.' }, 403);

    if (action === 'sync_vaga_publica') {
      // Cria (ou atualiza, se já existir uma para essa requisição) o
      // espelho público da vaga.
      const { data: existente } = await admin
        .from('rs_vagas_publicas')
        .select('id')
        .eq('requisicao_id', body.requisicaoId)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      const payload = {
        requisicao_id: body.requisicaoId,
        empresa_id: perfil.empresa_id,
        titulo: body.titulo,
        descricao: body.descricao || '',
        requisitos: body.requisitos || '',
        local: body.local || '',
        modalidade: body.modalidade || '',
        mostrar_salario: !!body.mostrarSalario,
        faixa_salarial: body.faixaSalarial || null,
        mostrar_empresa: body.mostrarEmpresa !== false,
        nome_empresa_exibicao: body.nomeEmpresaExibicao || null,
        jovem_aprendiz: !!body.jovemAprendiz,
        ativa: true,
        atualizado_em: new Date().toISOString(),
      };
      if (existente) {
        const { error } = await admin.from('rs_vagas_publicas').update(payload).eq('id', existente.id);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ vagaPublicaId: existente.id });
      }
      const { data, error } = await admin.from('rs_vagas_publicas').insert(payload).select('id').single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ vagaPublicaId: data.id });
    }

    if (action === 'desativar_vaga_publica') {
      const { error } = await admin
        .from('rs_vagas_publicas')
        .update({ ativa: false })
        .eq('requisicao_id', body.requisicaoId)
        .eq('empresa_id', perfil.empresa_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (action === 'listar_candidaturas_pendentes') {
      const { data: vagaPub } = await admin
        .from('rs_vagas_publicas')
        .select('id')
        .eq('requisicao_id', body.requisicaoId)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      if (!vagaPub) return jsonResponse({ candidaturas: [] });
      const { data, error } = await admin
        .from('rs_candidaturas_publicas')
        .select('id, nome, email, telefone, curriculo_path, aceite_banco_talentos, perfil, criado_em')
        .eq('vaga_publica_id', vagaPub.id)
        .eq('importada', false)
        .order('criado_em', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      const comLink = await Promise.all(
        (data || []).map(async (c) => {
          let curriculoUrl = null;
          if (c.curriculo_path) {
            const { data: assinada } = await admin.storage.from('curriculos-rs').createSignedUrl(c.curriculo_path, 3600);
            curriculoUrl = assinada?.signedUrl || null;
          }
          return { ...c, curriculoUrl };
        })
      );
      return jsonResponse({ candidaturas: comLink, vagaPublicaId: vagaPub.id });
    }

    if (action === 'importar_candidatura') {
      const { data: cand, error } = await admin
        .from('rs_candidaturas_publicas')
        .select('id, nome, email, telefone, empresa_id, perfil')
        .eq('id', body.candidaturaId)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      if (!cand) return jsonResponse({ error: 'Candidatura não encontrada.' }, 404);
      await admin.from('rs_candidaturas_publicas').update({ importada: true, importada_em: new Date().toISOString() }).eq('id', cand.id);
      return jsonResponse({ candidato: cand });
    }

    if (action === 'listar_banco_talentos') {
      // Quem passou do prazo sai do banco (o consentimento era "por até N meses").
      await admin.from('rs_banco_talentos').delete().eq('empresa_id', perfil.empresa_id).lt('criado_em', mesesAtras(Date.now(), BANCO_TALENTOS_MESES));
      const { data: linhas, error } = await admin
        .from('rs_banco_talentos')
        .select('id, candidatura_id, nome, email, telefone, curriculo_path, criado_em')
        .eq('empresa_id', perfil.empresa_id)
        .order('criado_em', { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      const grupos = agruparTalentos((linhas || []) as LinhaTalento[]);

      // Perfil e vaga de origem vêm da candidatura mais recente de cada pessoa.
      const idsCand = Array.from(new Set(grupos.map((g) => g.candidaturaIds[0]).filter(Boolean)));
      const candidaturas: Record<string, { perfil: unknown; vaga_publica_id: string | null }> = {};
      const titulos: Record<string, string> = {};
      if (idsCand.length) {
        const { data: cands } = await admin.from('rs_candidaturas_publicas').select('id, perfil, vaga_publica_id').eq('empresa_id', perfil.empresa_id).in('id', idsCand);
        (cands || []).forEach((c: { id: string; perfil: unknown; vaga_publica_id: string | null }) => (candidaturas[c.id] = c));
        const idsVaga = Array.from(new Set((cands || []).map((c: { vaga_publica_id: string | null }) => c.vaga_publica_id).filter(Boolean))) as string[];
        if (idsVaga.length) {
          const { data: vagas } = await admin.from('rs_vagas_publicas').select('id, titulo').eq('empresa_id', perfil.empresa_id).in('id', idsVaga);
          (vagas || []).forEach((v: { id: string; titulo: string }) => (titulos[v.id] = v.titulo));
        }
      }
      const talentos = grupos.map((g) => {
        const cand = candidaturas[g.candidaturaIds[0]];
        return {
          chave: g.chave,
          ids: g.ids,
          nome: g.nome,
          email: g.email,
          telefone: g.telefone,
          temCurriculo: !!g.idCurriculo,
          idCurriculo: g.idCurriculo,
          perfil: sanitizarPerfilCandidato(cand?.perfil), // só campos conhecidos, mesmo em registros antigos
          vagaTitulo: cand?.vaga_publica_id ? titulos[cand.vaga_publica_id] || null : null,
          entrouEm: g.entrouEm,
          expiraEm: mesesDepois(g.entrouEm, BANCO_TALENTOS_MESES),
          candidaturas: g.ids.length,
        };
      });
      return jsonResponse({ talentos, prazoMeses: BANCO_TALENTOS_MESES });
    }

    if (action === 'curriculo_talento') {
      // O navegador manda o id do talento — nunca o caminho do arquivo.
      if (!UUID_RE.test(String(body.id || ''))) return jsonResponse({ error: 'Talento inválido.' }, 400);
      const { data: linha } = await admin.from('rs_banco_talentos').select('curriculo_path').eq('id', body.id).eq('empresa_id', perfil.empresa_id).maybeSingle();
      if (!linha?.curriculo_path) return jsonResponse({ error: 'Currículo não encontrado.' }, 404);
      const { data, error } = await admin.storage.from('curriculos-rs').createSignedUrl(linha.curriculo_path, 600);
      if (error || !data) return jsonResponse({ error: 'Não foi possível gerar o link do currículo.' }, 500);
      return jsonResponse({ url: data.signedUrl });
    }

    if (action === 'remover_talentos') {
      // Tira a pessoa do banco (todas as autorizações dela). O currículo continua
      // ligado à candidatura original, que tem o próprio ciclo de vida.
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((i: string) => UUID_RE.test(i)).slice(0, 100);
      if (!ids.length) return jsonResponse({ error: 'Nenhum talento informado.' }, 400);
      const { error } = await admin.from('rs_banco_talentos').delete().eq('empresa_id', perfil.empresa_id).in('id', ids);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, removidos: ids.length });
    }

    if (action === 'baixar_curriculo') {
      const path = body.curriculoPath;
      if (!path || typeof path !== 'string' || path.includes('..') || !path.startsWith(`${perfil.empresa_id}/`)) return jsonResponse({ error: 'Acesso negado.' }, 403);
      const { data, error } = await admin.storage.from('curriculos-rs').createSignedUrl(path, 3600);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ url: data.signedUrl });
    }

    return jsonResponse({ error: `Ação desconhecida: "${action}".` }, 400);
  } catch (e) {
    console.error('Erro na função rs:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) Rode antes o sql/28-rs-pagina-publica.sql no projeto PRINCIPAL, e crie
//    o bucket privado "curriculos-rs" (Storage → New bucket).
// 2) No Supabase, projeto PRINCIPAL: Edge Functions → New Function → nome
//    exato: rs → cole este código → Deploy.
// 3) Configure o secret RECAPTCHA_SECRET_KEY (Edge Functions → rs →
//    Settings/Secrets) com a "Secret Key" que você pegou no Google
//    reCAPTCHA. Sem isso, toda candidatura será rejeitada (mensagem de
//    "não foi possível confirmar que você não é um robô").
// 4) "Verify JWT": as ações públicas (vaga_publica, candidatura_criar) são chamadas
//    sem login. Se o projeto usa as chaves novas (sb_publishable_...), que não são
//    JWT, deixe "Verify JWT" DESLIGADO nesta função; as ações do RH continuam
//    protegidas porque a própria função confere a sessão (auth.getUser).
// =========================================================================
