// =========================================================================
// INETRIS — Edge Function "teste-gratis"
// =========================================================================
// Pública (sem login) — chamada direto da landing comercial. Automatiza o fluxo inteiro, sem revisão humana
// (decisão: automação total, protegida pelo reCAPTCHA e por limites de uso):
//   1) valida o reCAPTCHA e os campos;
//   2) gera o código de licença de teste (7 dias) — ou REAPROVEITA o que a pessoa já pediu nas últimas 24 h e ainda não usou
//      (quem perdeu o e-mail não gera um código novo a cada tentativa);
//   3) registra a solicitação já aprovada (histórico e painel do Super Admin);
//   4) envia o e-mail com o código e um botão que já leva o código preenchido no cadastro — e CONFERE se o e-mail saiu;
//   5) avisa a equipe por e-mail a cada novo teste (e, se o e-mail do código falhou, manda o código para vocês entregarem);
//   6) devolve o código na resposta, para a página mostrá-lo na tela (o lead não depende só do e-mail).
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

// Mesma lógica de sql/23-page-super-admin.js (gerarCodigoLicencaLetras),
// só que rodando no servidor — crypto.getRandomValues() também existe
// nativamente no Deno, mesma família seguramente aleatória.
function gerarCodigoLicenca(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I, pra evitar confusão
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let c = 'NORTE-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) c += '-';
    c += chars[bytes[i] % chars.length];
  }
  return c;
}

// Confere quantas tentativas essa chave (normalmente o IP) já fez pra essa
// ação na janela de tempo — se já bateu no limite, recusa. Senão, registra
// mais uma tentativa e deixa passar. "admin" é o client com chave de
// serviço (só ele lê/escreve em rate_limit_log — ver sql/35-rate-limit.sql).
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

// ---- Entrada do formulário PÚBLICO: dado não confiável --------------------------
// UM endereço de e-mail simples (sem espaço, vírgula, ponto-e-vírgula, <>, aspas).
function emailValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]{2,}$/.test(v);
}
// Nome e empresa vão pro HTML do e-mail: sem escape, alguém poderia mandar um e-mail
// da INETRIS, pro endereço de qualquer pessoa, com links e texto à escolha.
function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- LÓGICA DO TESTE (a parte pura: testada, sem rede nem banco) ----------------------------
const WHATSAPP_SUPORTE = '558999857062'; // o MESMO número das rotinas diárias (avisos de fim de teste)
const SITE_PADRAO = 'https://rhalley21.github.io/Sistema-Norte/'; // vale se o segredo URL_SITE não existir
// Limites. O reCAPTCHA é a barreira contra robô; aqui o que se quer é impedir abuso e não barrar quem está tentando de boa.
//  - tentativas por hora: conta TODA chamada (com erro ou não), só para barrar quem martela a função;
//  - pedidos válidos por IP: alto, porque celulares de uma mesma operadora COMPARTILHAM o endereço IP;
//  - pedidos por e-mail: baixo, porque é o que impede encher a caixa de entrada de uma pessoa com e-mails da INETRIS.
const LIMITES = { tentativasPorHora: 30, pedidosPorIpPorDia: 10, pedidosPorEmailPorDia: 2 };
const JANELA_REAPROVEITAR_MS = 24 * 3600000;

function normalizarEmail(e: string): string {
  return String(e || '').trim().toLowerCase();
}
// O endereço do site, sempre com a barra no fim (o segredo URL_SITE pode vir com ou sem).
function baseDoSite(urlSite: string | undefined | null): string {
  const u = String(urlSite || '').trim() || SITE_PADRAO;
  return u.endsWith('/') ? u : `${u}/`;
}
// O botão do e-mail: abre o cadastro com o código já preenchido. SÓ o código vai no endereço (o endereço passa por ferramentas
// de monitoramento; nome, e-mail e empresa nunca vão nele).
function linkDeCadastro(base: string, codigo: string): string {
  return `${base}app.html#cadastro&codigo=${encodeURIComponent(codigo)}`;
}
function linkWhatsApp(): string {
  return `https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent('Olá! Tenho uma dúvida sobre o teste grátis do INETRIS.')}`;
}
// Dos pedidos que esta pessoa fez nas últimas 24 h, devolve o código mais recente que AINDA NÃO foi usado (ou null).
function codigoReaproveitavel(pedidos: { codigo_gerado: string | null; criado_em: string }[], naoUsados: string[], agora: number): string | null {
  const livres = new Set(naoUsados);
  const candidatos = (pedidos || [])
    .filter((p) => p.codigo_gerado && livres.has(p.codigo_gerado) && agora - new Date(p.criado_em).getTime() <= JANELA_REAPROVEITAR_MS)
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
  return candidatos.length ? (candidatos[0].codigo_gerado as string) : null;
}
// O e-mail do código. Nada que a pessoa digitou entra sem escape; o endereço do botão também é escapado.
function montarEmailCodigo(d: { nome: string; nomeEmpresa: string; codigo: string; urlCadastro: string }): { assunto: string; corpoHtml: string } {
  const { nome, nomeEmpresa, codigo, urlCadastro } = d;
  return {
    assunto: 'Seu código do teste grátis do INETRIS',
    corpoHtml: `<p>Olá, ${escaparHtml(nome)}!</p>
<p>Seu teste grátis de 7 dias do INETRIS (Sistema de Gestão de Pessoas) foi liberado para a empresa <b>${escaparHtml(nomeEmpresa)}</b>.</p>
<p>Seu código de licença:</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:1px;">${codigo}</p>
<p><a href="${escaparHtml(urlCadastro)}" style="display:inline-block;background:#cba228;color:#092646;padding:12px 22px;border-radius:8px;font-weight:bold;text-decoration:none;">Criar minha conta agora</a></p>
<p>O botão já leva o código preenchido. Se preferir, abra o sistema, toque em <b>Cadastrar</b> e digite o código acima.</p>
<p>O teste vale por 7 dias a partir do cadastro, sem compromisso.</p>
<p>Dúvidas? <a href="${escaparHtml(linkWhatsApp())}">Fale com a gente no WhatsApp</a>.</p>
<p>Instituto INETRIS</p>`,
  };
}
// O aviso para a equipe (vendas): quem pediu e como falar com a pessoa. Se o e-mail do código não saiu, o código vai aqui para
// vocês entregarem à mão.
function montarAvisoEquipe(d: { nome: string; email: string; nomeEmpresa: string; telefone: string; codigo: string; emailEnviado: boolean }): { assunto: string; corpoHtml: string } {
  const { nome, email, nomeEmpresa, codigo } = d;
  const telefone = d.telefone || 'não informado';
  const empresaCurta = nomeEmpresa.replace(/\s+/g, ' ').slice(0, 70);
  if (d.emailEnviado) {
    return {
      assunto: `Novo teste grátis: ${empresaCurta}`,
      corpoHtml: `<p>Chegou um novo teste grátis. Vale falar com a pessoa nas próximas 24 horas.</p>
<table style="border-collapse:collapse;font-size:14px;"><tr><td style="padding:3px 14px 3px 0;color:#555;">Nome</td><td><b>${escaparHtml(nome)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">E-mail</td><td><b>${escaparHtml(email)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Empresa</td><td><b>${escaparHtml(nomeEmpresa)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Telefone</td><td><b>${escaparHtml(telefone)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Código</td><td><b>${codigo}</b></td></tr></table>
<p style="color:#666;font-size:12px;">Os testes ficam no painel do Super Admin.</p>`,
    };
  }
  return {
    assunto: `ATENÇÃO: novo teste grátis, o e-mail do código NÃO saiu (${empresaCurta})`,
    corpoHtml: `<p><b>O e-mail com o código não saiu.</b> A pessoa viu o código na tela do site, mas envie também por conta própria.</p>
<table style="border-collapse:collapse;font-size:14px;"><tr><td style="padding:3px 14px 3px 0;color:#555;">Nome</td><td><b>${escaparHtml(nome)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">E-mail</td><td><b>${escaparHtml(email)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Empresa</td><td><b>${escaparHtml(nomeEmpresa)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Telefone</td><td><b>${escaparHtml(telefone)}</b></td></tr><tr><td style="padding:3px 14px 3px 0;color:#555;">Código</td><td><b>${codigo}</b></td></tr></table>
<p style="color:#666;font-size:12px;">Os testes ficam no painel do Super Admin.</p>`,
  };
}
// ---- fim: lógica do teste ---------------------------------------------------------------------

// Manda um e-mail pelo enviar-email (com a chave de serviço) e CONFERE se saiu: antes o resultado era ignorado, e um e-mail que
// falhava deixava a pessoa vendo "Teste liberado!" sem receber nada.
async function enviarEmail(para: string, assunto: string, corpoHtml: string): Promise<boolean> {
  try {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ destinatario: para, assunto, corpoHtml }),
    });
    if (!resp.ok) console.error('enviar-email recusou o e-mail do teste grátis:', resp.status, await resp.text().catch(() => ''));
    return resp.ok;
  } catch (e) {
    console.error('Falha ao chamar enviar-email (teste grátis):', e);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const nome = String(body.nome || '').trim().slice(0, 120);
    const email = String(body.email || '').trim();
    const nomeEmpresa = String(body.empresa || '').trim().slice(0, 160);
    const telefone = String(body.telefone || '').trim().slice(0, 40);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ip = ipDoRequisitante(req);
    // 1) Só barra quem martela a função (toda chamada conta, com erro ou não).
    if (!(await dentroDoLimite(admin, ip, 'teste_gratis_tentativa', LIMITES.tentativasPorHora, 1))) {
      return jsonResponse({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.' }, 429);
    }

    const recaptchaOk = await validarRecaptcha(body.recaptchaToken);
    if (!recaptchaOk) {
      return jsonResponse({ error: 'Não foi possível confirmar que você não é um robô. Tente novamente.' }, 400);
    }
    if (!nome || !email || !nomeEmpresa) {
      return jsonResponse({ error: 'Preencha nome, e-mail e nome da empresa.' }, 400);
    }
    if (!emailValido(email)) {
      return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
    }
    const emailNorm = normalizarEmail(email);

    // 2) Daqui para baixo só contam pedidos VÁLIDOS (antes, tentativa com erro gastava a cota e o 4º pedido de um IP
    //    compartilhado era barrado).
    if (!(await dentroDoLimite(admin, `email:${emailNorm}`, 'teste_gratis_email', LIMITES.pedidosPorEmailPorDia, 24))) {
      return jsonResponse({ error: 'Você já pediu o código duas vezes hoje. Confira sua caixa de entrada e o spam, ou fale com a gente no WhatsApp.' }, 429);
    }
    if (!(await dentroDoLimite(admin, ip, 'teste_gratis', LIMITES.pedidosPorIpPorDia, 24))) {
      return jsonResponse({ error: 'Muitas solicitações vindas deste endereço hoje. Tente novamente amanhã ou fale com a gente no WhatsApp.' }, 429);
    }

    // 3) Já pediu nas últimas 24 h e não usou o código? Reaproveita (e reenvia o e-mail) em vez de gerar outro.
    const desde = new Date(Date.now() - JANELA_REAPROVEITAR_MS).toISOString();
    const { data: pedidosAnteriores } = await admin.from('solicitacoes_teste').select('codigo_gerado, criado_em').eq('email', emailNorm).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(5);
    const codigosAnteriores = (pedidosAnteriores || []).map((p: { codigo_gerado: string | null }) => p.codigo_gerado).filter(Boolean);
    let naoUsados: string[] = [];
    if (codigosAnteriores.length) {
      const { data: livres } = await admin.from('codigos_licenca_empresa').select('codigo').in('codigo', codigosAnteriores).eq('usado', false);
      naoUsados = (livres || []).map((l: { codigo: string }) => l.codigo);
    }
    const reaproveitado = codigoReaproveitavel(pedidosAnteriores || [], naoUsados, Date.now());

    let codigo = reaproveitado;
    if (!codigo) {
      codigo = gerarCodigoLicenca();
      const { error: erroCodigo } = await admin.from('codigos_licenca_empresa').insert({
        codigo,
        nome_empresa_sugerido: nomeEmpresa,
        trial_dias: 7,
      });
      if (erroCodigo) return jsonResponse({ error: erroCodigo.message }, 500);

      // Registra a solicitação já como aprovada — pra manter o histórico e a visão consolidada no painel do Super Admin.
      const { error: erroSolicitacao } = await admin.from('solicitacoes_teste').insert({
        nome_solicitante: nome,
        email: emailNorm,
        nome_empresa: nomeEmpresa,
        telefone: telefone || null,
        status: 'aprovada',
        codigo_gerado: codigo,
        decidido_em: new Date().toISOString(),
      });
      if (erroSolicitacao) console.error('Falha ao registrar solicitação (código já foi gerado, segue mesmo assim):', erroSolicitacao);
    }

    // 4) E-mail com o código — e confere se saiu.
    const urlCadastro = linkDeCadastro(baseDoSite(Deno.env.get('URL_SITE')), codigo);
    const email1 = montarEmailCodigo({ nome, nomeEmpresa, codigo, urlCadastro });
    const emailEnviado = await enviarEmail(emailNorm, email1.assunto, email1.corpoHtml);

    // 5) Aviso para a equipe a cada teste NOVO (reenvio do mesmo código não avisa de novo). Não trava a resposta se falhar.
    if (!reaproveitado) {
      const aviso = montarAvisoEquipe({ nome, email: emailNorm, nomeEmpresa, telefone, codigo, emailEnviado });
      enviarEmail(Deno.env.get('EMAIL_EQUIPE') || 'inetris25@gmail.com', aviso.assunto, aviso.corpoHtml).catch(() => {});
    }

    return jsonResponse({ codigo, emailEnviado, reaproveitado: !!reaproveitado, urlCadastro });
  } catch (e) {
    console.error('Erro na função teste-gratis:', e);
    return jsonResponse({ error: 'Erro interno: ' + String(e) }, 500);
  }
});

// =========================================================================
// COMO IMPLANTAR
// =========================================================================
// 1) No Supabase, projeto PRINCIPAL: Edge Functions → New Function → nome
//    exato: teste-gratis → cole este código → Deploy.
// 2) Secrets: RECAPTCHA_SECRET_KEY (mesmo valor já usado na função "rs") — sem ele toda solicitação é rejeitada;
//    URL_SITE (o endereço do site, p. ex. https://sistema.inetris.com.br/ — é o que monta o botão do e-mail);
//    EMAIL_EQUIPE (quem recebe o aviso de cada novo teste; sem ele vai para inetris25@gmail.com).
// 3) "Verify JWT": esta função é chamada da página de vendas SEM login, só com a
//    chave pública do projeto. Se o projeto usa as chaves novas (sb_publishable_...),
//    que não são JWT, deixe "Verify JWT" DESLIGADO — senão toda chamada volta 401.
//    A função se protege sozinha (reCAPTCHA + limite por IP).
// =========================================================================
