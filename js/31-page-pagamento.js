/* =========================================================
   MÓDULO PAGAMENTO (Fase 1)
   -----------------------------------------------------------
   Tela que a empresa-cliente vê: plano atual, valor, status e o
   botão que leva ao link de pagamento da InfinitePay cadastrado
   pelo Super Admin/Admin em Empresa. A confirmação do pagamento é
   manual por enquanto (o status vem de faturamento.statusPagamento);
   a automação por webhook é a Fase 2.
   ========================================================= */

// Planos de referência exibidos como cartões. O plano contratado de cada
// empresa vem de state.empresa.faturamento.plano; estes valores são só a
// tabela de preços mostrada — o valor cobrado real é o valorMensal do contrato.
// Definição central dos planos — usada na tela de Pagamento, no cadastro da
// empresa e no bloqueio de cadastro de colaboradores por limite.
// precoNovo = cliente novo; precoAtual = cliente com 12 meses (fidelidade).
// limiteColaboradores define o teto de cadastro daquele plano.
const PLANOS_NORTE = [
  { nome: 'Essencial', limiteColaboradores: 10, precoNovo: 297, precoAtual: 197, detalhe: 'Até 10 colaboradores' },
  { nome: 'Gestão', limiteColaboradores: 30, precoNovo: 597, precoAtual: 397, detalhe: '11 a 30 colaboradores' },
  { nome: 'Estratégico', limiteColaboradores: 60, precoNovo: 997, precoAtual: 697, detalhe: '31 a 60 colaboradores' },
];

// Limite de colaboradores do plano de uma empresa. Sem plano definido, usa o
// menor (Essencial, até 10) como padrão. Usado pra bloquear novos cadastros.
function limiteColaboradoresDaEmpresa() {
  const nomePlano = state.empresa?.faturamento?.plano;
  const plano = PLANOS_NORTE.find((p) => p.nome === nomePlano) || PLANOS_NORTE[0];
  return { plano: plano.nome, limite: plano.limiteColaboradores };
}

function formatarPrecoPlano(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function corDoStatusPagamento(status) {
  if (status === 'Em dia') return 'pill-alavancar';
  if (status === 'Atrasado' || status === 'Cancelado') return 'pill-iniciar';
  return 'pill-neutral'; // Pendente / sem status
}

function formatarValorMensal(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pagePagamento() {
  const f = state.empresa?.faturamento || {};
  const planoAtual = f.plano || '—';
  const status = f.statusPagamento || 'Pendente';
  const temLink = !!f.linkPagamento;

  return `
    <div class="page-head">
      <div class="eyebrow">Assinatura</div>
      <h1>Pagamento</h1>
      <p class="page-desc">Seu plano, o valor da mensalidade e o link para pagamento.</p>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">Assinatura e pagamento</h3>
        <span class="pill ${corDoStatusPagamento(status)}">${status}${f.proximaCobranca ? ` · próxima cobrança ${new Date(`${f.proximaCobranca}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}</span>
      </div>

      <div class="grid3" style="margin:18px 0;">
        ${PLANOS_NORTE.map(
          (p) => `
          <div class="card" style="margin:0;${p.nome === planoAtual ? 'border:2px solid var(--gold);position:relative;' : ''}">
            ${p.nome === planoAtual ? '<span class="pill pill-alavancar" style="position:absolute;top:-12px;left:12px;">Seu plano</span>' : ''}
            <div class="small-muted">${p.nome}</div>
            <div style="font-size:24px;font-weight:600;margin:4px 0;">${formatarPrecoPlano(p.precoNovo)}<span class="small-muted" style="font-size:13px;font-weight:400;">/mês</span></div>
            <div class="small-muted" style="font-size:12px;">${p.detalhe}</div>
          </div>
        `
        ).join('')}
      </div>

      <table style="width:100%;font-size:14px;border-top:1px solid var(--line);">
        <tr><td class="small-muted" style="padding:8px 0;">Plano contratado</td><td style="text-align:right;">${planoAtual}${f.periodicidade ? ` · ${f.periodicidade}` : ''}</td></tr>
        <tr><td class="small-muted" style="padding:8px 0;">Valor</td><td style="text-align:right;font-weight:600;">${formatarValorMensal(f.valorMensal)}</td></tr>
        <tr><td class="small-muted" style="padding:8px 0;">Forma de pagamento</td><td style="text-align:right;">${f.formaPagamento || 'Pix · Cartão · Boleto'} (InfinitePay)</td></tr>
        <tr><td class="small-muted" style="padding:8px 0;">Status</td><td style="text-align:right;">${status}</td></tr>
      </table>

      <div style="margin-top:18px;">
        ${
          temLink
            ? `<a class="btn btn-primary" href="${f.linkPagamento}" target="_blank" rel="noopener">Pagar mensalidade</a>`
            : `<div class="notice info">O link de pagamento ainda não foi configurado. Entre em contato com o Instituto INETRIS para regularizar sua assinatura.</div>`
        }
      </div>
    </div>

    <div class="notice info">Após o pagamento, a confirmação pode levar algumas horas para refletir aqui. Em caso de dúvida sobre uma cobrança, fale com o Instituto INETRIS.</div>
  `;
}
