/* =========================================================
   COBRANÇA POR LINK DE PAGAMENTO (lado do navegador)
   -----------------------------------------------------------
   O teste grátis continua SEM cartão. No fim dos 7 dias a pessoa recebe o link de pagamento do plano dela e PAGA se quiser
   continuar. Nada é cobrado sozinho: quem não paga fica com o acesso pausado e os dados guardados.

   Este arquivo desenha, na tela de Pagamento do Administrador, o plano escolhido, o valor, a data e o botão de pagar; mostra o
   botão de pagar também na tela de entrada quando o teste já terminou; e dá ao Super Admin a situação da cobrança e o botão
   "Confirmar pagamento". Quem decide e grava tudo é o servidor (função "cobranca"): aqui só se pede e se mostra. O texto do
   aceite, os valores e o link vêm SEMPRE do servidor, nunca são montados aqui.

   Só aparece quando a cobrança está ligada (cobrancaAtiva no ambiente.js, junto do segredo COBRANCA_ATIVA no servidor).
   ========================================================= */

let cobrancaEstado = { carregado: false, carregando: false, erro: null, dados: null, trocando: false };

function cobrancaLigada() {
  return !!(window.NORTE_AMBIENTE && window.NORTE_AMBIENTE.cobrancaAtiva === true);
}

// Dinheiro em reais, a partir de centavos inteiros (o mesmo cálculo da função "cobranca": um teste confere).
function cobrancaReais(centavos) {
  const c = Math.round(Number(centavos) || 0);
  const reais = Math.floor(c / 100);
  const cent = c % 100;
  return `R$ ${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(cent).padStart(2, '0')}`;
}

// Só aceita link https sem espaço nem aspas (o que o banco também exige): o resto vira vazio e o botão nem aparece.
function cobrancaLinkSeguro(url) {
  const u = String(url || '');
  return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '';
}

function cobrancaDataBR(iso) {
  const [a, m, d] = String(iso || '')
    .slice(0, 10)
    .split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

async function cobrancaChamar(corpo) {
  const { data, error } = await sb.functions.invoke('cobranca', { body: corpo });
  if (error) {
    let mensagem = error.message || 'Erro ao falar com o servidor.';
    try {
      const j = await error.context.json(); // a resposta do servidor traz a explicação em português
      if (j && j.error) mensagem = j.error;
    } catch (_) {}
    throw new Error(mensagem);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function cobrancaCarregar(forcar) {
  if (!cobrancaLigada() || cobrancaEstado.carregando) return;
  if (cobrancaEstado.carregado && !forcar) return;
  cobrancaEstado.carregando = true;
  try {
    cobrancaEstado.dados = await cobrancaChamar({ action: 'resumo' });
    cobrancaEstado.erro = null;
  } catch (e) {
    cobrancaEstado.erro = e.message;
    console.warn('Cobrança indisponível:', e.message);
  }
  cobrancaEstado.carregando = false;
  cobrancaEstado.carregado = true;
  render();
}

const COBRANCA_ROTULOS = {
  agendada: 'Pagamento no fim do teste',
  aguardando_pagamento: 'Aguardando pagamento',
  ativa: 'Ativa',
  em_atraso: 'Em atraso',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
};
function cobrancaRotuloStatus(status) {
  return COBRANCA_ROTULOS[status] || String(status || '');
}
function cobrancaCorStatus(status) {
  if (status === 'ativa') return 'pill-alavancar';
  if (status === 'agendada') return 'pill-desenvolver';
  if (status === 'cancelada') return 'pill-neutral';
  return 'pill-iniciar'; // aguardando pagamento, em atraso, suspensa
}

// O plano que comporta esta quantidade de colaboradores (a lista de planos vem do servidor); null se passa do maior plano.
function cobrancaSugerirPlano(planos, n) {
  if (!Array.isArray(planos) || !(n >= 1)) return null;
  const p = planos.find((x) => n <= x.ate);
  return p ? p.chave : null;
}

function cobrancaCartoesDePlanos(d, sugerido) {
  return `<div class="grid3" style="margin:14px 0;">${d.planos
    .map(
      (p) => `
      <div class="card" style="margin:0;${p.chave === sugerido ? 'border:2px solid var(--gold);position:relative;' : ''}">
        ${p.chave === sugerido ? '<span class="pill pill-alavancar" style="position:absolute;top:-12px;left:12px;">Sugerido para a sua equipe</span>' : ''}
        <div class="small-muted">${escaparHtml(p.nome)}</div>
        <div style="font-size:22px;font-weight:600;margin:4px 0;">${escaparHtml(p.mensalidade)}<span class="small-muted" style="font-size:13px;font-weight:400;">/mês</span></div>
        <div class="small-muted" style="font-size:12px;">${escaparHtml(p.detalhe)}</div>
        <div class="small-muted" style="font-size:12px;margin-top:4px;">Implantação: ${escaparHtml(p.implantacao)}</div>
        <div class="small-muted" style="font-size:12px;">A pagar no fim do teste: <b>${escaparHtml(p.total)}</b></div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%;" onclick="cobrancaEscolherPlano('${/^[a-z]+$/.test(p.chave) ? p.chave : ''}')">Escolher este plano</button>
      </div>`
    )
    .join('')}</div>`;
}

const COBRANCA_AVISO_SEM_CARTAO =
  'Nada é cobrado automaticamente: no fim do teste você recebe o link para pagar; se pagar, o acesso continua, e, se não pagar, ele é pausado e seus dados ficam guardados.';

// O bloco da tela de Pagamento (só o Administrador chega aqui; a função do servidor também confere).
function blocoCobrancaHtml() {
  if (!cobrancaLigada()) return '';
  const e = cobrancaEstado;
  if (!e.carregado) {
    setTimeout(() => cobrancaCarregar(false), 0);
    return '<div class="card"><h3 style="margin:0 0 8px;">Sua assinatura</h3><p class="small-muted" style="margin:0;">Carregando…</p></div>';
  }
  if (e.erro) return ''; // a cobrança é opcional: se o servidor ainda não está pronto, o bloco não aparece (o motivo fica no console)
  const d = e.dados;
  if (!d || !d.ativa) return '';
  const a = d.assinatura;

  // cancelou depois de pagar: o acesso continua até o fim do período já pago
  if (a && a.status === 'cancelada' && a.pagoEm) {
    return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">Assinatura cancelada</h3>
        <span class="pill ${cobrancaCorStatus('cancelada')}">${escaparHtml(cobrancaRotuloStatus('cancelada'))}</span>
      </div>
      <p style="margin:12px 0 0;">Cancelada em ${escaparHtml(cobrancaDataBR(a.canceladaEm))}. O acesso continua até <b>${escaparHtml(a.cicloEmBR)}</b>, o fim do período já pago. Depois disso o acesso é encerrado e <b>seus dados continuam guardados</b>. Para voltar, fale com a gente.</p>
    </div>`;
  }

  // ainda sem plano escolhido (ou cancelou antes de pagar): escolher
  if (!a || a.status === 'cancelada') {
    if (!d.trialAte || d.ehPagante) return '';
    const sugerido = cobrancaSugerirPlano(d.planos, (state.colaboradores || []).length);
    return `
    <div class="card">
      <h3 style="margin:0 0 6px;">${a ? 'Assinatura cancelada' : 'Escolha o plano da sua empresa'}</h3>
      <p class="small-muted" style="margin:0 0 4px;">${a ? `Cancelada em ${escaparHtml(cobrancaDataBR(a.canceladaEm))}. Você pode escolher um plano de novo.` : `Seu teste grátis termina em <b>${escaparHtml(cobrancaDataBR(d.trialAte))}</b>.`}</p>
      <p class="small-muted" style="margin:0;">${COBRANCA_AVISO_SEM_CARTAO}</p>
      ${cobrancaCartoesDePlanos(d, sugerido)}
    </div>`;
  }

  const mensal = a.ciclo === 'mensalidade';
  const link = cobrancaLinkSeguro(a.link);
  const pagar = link
    ? `<a class="btn btn-primary" href="${escaparHtml(link)}" target="_blank" rel="noopener" style="text-decoration:none;">Pagar ${escaparHtml(a.total)} agora</a>`
    : a.linkIndisponivel
      ? `<a class="btn btn-primary" href="${escaparHtml(a.whatsapp)}" target="_blank" rel="noopener" style="text-decoration:none;">Pedir o link no WhatsApp</a>`
      : '';
  const dias = a.diasParaCobranca;
  const faltam = dias > 0 ? ` (daqui a ${dias} dia${dias === 1 ? '' : 's'})` : '';
  let situacao;
  if (a.status === 'agendada') {
    situacao = `Seu teste termina em <b>${escaparHtml(a.primeiraCobrancaEmBR)}</b>${faltam}. Nessa data, pague <b>${escaparHtml(a.total)}</b> ${/^R\$/.test(a.implantacao) ? '(implantação e primeira mensalidade)' : '(a primeira mensalidade)'} para continuar. ${link ? '' : 'O link de pagamento aparece aqui, e chega no seu e-mail, 3 dias antes do fim do teste.'}`;
  } else if (a.status === 'ativa') {
    const confirmado = a.pagoEm ? `Pagamento confirmado em ${escaparHtml(cobrancaDataBR(a.pagoEm))}. ` : '';
    situacao = link
      ? `${confirmado}A próxima mensalidade (<b>${escaparHtml(a.total)}</b>) vence em <b>${escaparHtml(a.cicloEmBR)}</b>${faltam}. Pague pelo link para continuar sem interrupção.`
      : `${confirmado}Obrigado por continuar com o INETRIS. A próxima mensalidade vence em <b>${escaparHtml(a.cicloEmBR)}</b>; o link de pagamento chega no seu e-mail 3 dias antes.`;
  } else if (a.status === 'em_atraso') {
    situacao = `A mensalidade de <b>${escaparHtml(a.total)}</b>, vencida em ${escaparHtml(a.cicloEmBR)}, ainda não foi paga. Pague até <b>${escaparHtml(a.suspensaoEmBR)}</b> para evitar a suspensão do acesso. Seus dados continuam guardados.`;
  } else if (a.status === 'suspensa') {
    situacao = `O acesso está suspenso por falta de pagamento da mensalidade vencida em ${escaparHtml(a.cicloEmBR)}. Pague <b>${escaparHtml(a.total)}</b> para voltar. Seus dados continuam guardados.`;
  } else if (mensal) {
    situacao = `A mensalidade de <b>${escaparHtml(a.total)}</b> vence em <b>${escaparHtml(a.cicloEmBR)}</b>. Pague pelo link para continuar sem interrupção. Depois de pagar, a confirmação pode levar algumas horas.`;
  } else {
    situacao = `Seu teste terminou. Pague <b>${escaparHtml(a.total)}</b> para continuar usando. Seus dados continuam guardados. Depois de pagar, a confirmação pode levar algumas horas.`;
  }
  const trocar = e.trocando && a.podeTrocarPlano ? cobrancaCartoesDePlanos(d, a.plano.chave) : '';
  const linha = (rotulo, valor, forte) =>
    `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:14px;"><span class="small-muted">${rotulo}</span><span style="${forte || ''}">${escaparHtml(valor)}</span></div>`;
  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">Sua assinatura: plano ${escaparHtml(a.plano.nome)}</h3>
        <span class="pill ${cobrancaCorStatus(a.status)}">${escaparHtml(cobrancaRotuloStatus(a.status))}</span>
      </div>
      <div class="small-muted" style="margin-top:2px;">${escaparHtml(a.plano.detalhe)}</div>
      <p style="margin:12px 0 4px;">${situacao}</p>
      <div style="margin-top:10px;">
        ${linha('Mensalidade (sem fidelidade)', a.mensalidade)}
        ${linha('Implantação', a.implantacao)}
        ${linha(mensal ? 'Próximo pagamento' : 'Primeiro pagamento', a.total, 'font-weight:600;')}
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${pagar}
        ${a.podeTrocarPlano ? '<button class="btn btn-ghost btn-sm" onclick="cobrancaAlternarTroca()">Trocar de plano</button>' : ''}
        ${a.podeCancelar ? '<button class="btn btn-ghost btn-sm" style="color:var(--iniciar-texto);" onclick="cobrancaCancelar()">Cancelar assinatura</button>' : ''}
      </div>
      ${trocar}
      <details style="margin-top:12px;"><summary class="small-muted" style="cursor:pointer;">O que foi combinado</summary><p class="small-muted" style="margin:8px 0 0;">${escaparHtml(a.aceiteTexto)}</p></details>
    </div>`;
}

function cobrancaAlternarTroca() {
  cobrancaEstado.trocando = !cobrancaEstado.trocando;
  render();
}

async function cobrancaEscolherPlano(chave) {
  if (!/^[a-z]+$/.test(String(chave || ''))) return;
  const d = cobrancaEstado.dados;
  const p = d && d.planos ? d.planos.find((x) => x.chave === chave) : null;
  if (!p) return;
  if (
    !confirm(
      `Escolher o plano ${p.nome}? Mensalidade de ${p.mensalidade} (sem fidelidade). Implantação: ${p.implantacao}. No fim do teste você recebe o link para pagar ${p.total}. Nada é cobrado automaticamente.`
    )
  )
    return;
  try {
    const r = await cobrancaChamar({ action: 'escolher_plano', plano: chave });
    cobrancaEstado.dados = { ...d, assinatura: r.resumo };
    cobrancaEstado.trocando = false;
    registrarAuditoria('cobranca.plano_escolhido', { plano: chave });
    showToast(`Plano ${p.nome} registrado.`);
  } catch (e) {
    showToast('Não foi possível registrar o plano: ' + e.message);
  }
  render();
}

async function cobrancaCancelar() {
  const d = cobrancaEstado.dados;
  const a = d && d.assinatura;
  if (!a || !a.podeCancelar) return;
  const aviso =
    a.status === 'ativa'
      ? `O acesso continua até ${a.cicloEmBR}, o fim do período já pago, e depois é encerrado (os dados ficam guardados). Para tratar de devolução de valores, fale com a gente.`
      : 'Se o teste ainda estiver valendo, ele continua até o fim; depois o acesso é pausado e seus dados ficam guardados.';
  if (!confirm(`Cancelar a assinatura do plano ${a.plano.nome}? Você não receberá mais o link de pagamento. ${aviso}`))
    return;
  try {
    const r = await cobrancaChamar({ action: 'cancelar' });
    cobrancaEstado.dados = { ...d, assinatura: r.resumo };
    registrarAuditoria('cobranca.cancelada', { plano: a.plano.chave });
    showToast('Assinatura cancelada.');
  } catch (e) {
    showToast('Não foi possível cancelar: ' + e.message);
  }
  render();
}

// Tela de entrada, quando o teste já terminou: o link para pagar e o valor, para a pessoa continuar na hora. Precisa da sessão
// (chamar ANTES de sair). Qualquer falha ou demora devolve null e a tela segue só com o WhatsApp.
async function cobrancaDadosParaBloqueio() {
  if (!cobrancaLigada()) return null;
  try {
    const dados = await Promise.race([
      cobrancaChamar({ action: 'resumo' }),
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('tempo esgotado')), 4000)),
    ]);
    const a = dados && dados.assinatura;
    if (!a || a.status === 'cancelada' || a.status === 'ativa') return null;
    const link = cobrancaLinkSeguro(a.link);
    return link ? { link, total: String(a.total || '') } : null;
  } catch (_) {
    return null;
  }
}

// ---- Super Admin ----
function cobrancaDaEmpresa(empresaId) {
  return (
    (typeof _superAdminAssinaturas !== 'undefined' ? _superAdminAssinaturas : []).find(
      (a) => a.empresa_id === empresaId
    ) || null
  );
}
const COBRANCA_NOMES_PLANO = { essencial: 'Essencial', gestao: 'Gestão', estrategico: 'Estratégico' };
function cobrancaSeloSuperAdmin(empresaId) {
  const a = cobrancaDaEmpresa(empresaId);
  if (!a) return '';
  return `<div class="small-muted" style="font-size:11px;margin-top:4px;">Cobrança: ${escaparHtml(COBRANCA_NOMES_PLANO[a.plano] || a.plano)} · ${escaparHtml(cobrancaRotuloStatus(a.status))} · ${escaparHtml(cobrancaReais(a.primeira_cobranca_centavos))}${(a.ultima_cobranca_em && a.proxima_cobranca_em ? a.proxima_cobranca_em : a.primeira_cobranca_em) ? ` · até ${escaparHtml(cobrancaDataBR(a.ultima_cobranca_em && a.proxima_cobranca_em ? a.proxima_cobranca_em : a.primeira_cobranca_em))}` : ''}</div>`;
}
// Hoje, no horário do navegador (AAAA-MM-DD).
function cobrancaHojeISO() {
  return new Date().toLocaleDateString('en-CA');
}
// Aceita a linha da assinatura (ou só o texto da situação). Ativa só entra na janela do vencimento (pagou a mensalidade adiantado).
function cobrancaPodeConfirmar(a) {
  const status = typeof a === 'string' ? a : a && a.status;
  if (status === 'agendada' || status === 'aguardando_pagamento' || status === 'em_atraso' || status === 'suspensa')
    return true;
  if (status === 'ativa' && a && typeof a === 'object' && a.proxima_cobranca_em) {
    const dias = Math.round(
      (Date.parse(`${a.proxima_cobranca_em}T12:00:00Z`) - Date.parse(`${cobrancaHojeISO()}T12:00:00Z`)) / 86400000
    );
    return dias <= 3;
  }
  return false;
}
// Há assinatura esperando pagamento? Então o certo é "Confirmar pagamento" (que também ativa a assinatura), não o botão antigo.
function cobrancaTemAssinaturaPendente(empresaId) {
  const a = cobrancaDaEmpresa(empresaId);
  return !!a && cobrancaPodeConfirmar(a);
}
function cobrancaBotaoConfirmar(empresaId, nome) {
  const a = cobrancaDaEmpresa(empresaId);
  if (!a || !cobrancaPodeConfirmar(a)) return '';
  return `<button class="btn btn-sm btn-primary" onclick="confirmarPagamentoCobranca('${escaparHtml(String(empresaId))}','${escaparParaOnclick(nome)}')">Confirmar pagamento</button>`;
}
async function confirmarPagamentoCobranca(empresaId, nome) {
  const a = cobrancaDaEmpresa(empresaId);
  if (!a) return;
  if (
    !confirm(
      `Confirmar que "${nome}" pagou ${cobrancaReais(a.primeira_cobranca_centavos)}? A assinatura fica ativa e a empresa passa a ser cliente (o acesso deixa de depender do prazo do teste).`
    )
  )
    return;
  try {
    await cobrancaChamar({ action: 'confirmar_pagamento', empresa_id: empresaId });
    showToast(`Pagamento de "${nome}" confirmado: acesso liberado.`);
  } catch (e) {
    showToast('Não foi possível confirmar o pagamento: ' + e.message);
    return;
  }
  await carregarDadosSuperAdmin();
}
