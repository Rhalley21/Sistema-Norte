/* =========================================================
   PRIMEIROS PASSOS (um só, para a empresa que está começando)
   -----------------------------------------------------------
   O painel do Administrador tinha DOIS blocos de onboarding diferentes ao mesmo tempo ("Onboarding do tenant" e "Primeiros
   passos"), com listas que não batiam e nada de recrutamento. Este módulo é o ÚNICO: calcula tudo do estado real da empresa
   (nada de contador manual), mostra o PRÓXIMO passo em destaque, explica por que cada um importa, e some sozinho quando os
   passos obrigatórios acabam (ou quando a pessoa clica em "Ocultar").

   O começo do arquivo é uma função PURA (sem tela), testada.
   ========================================================= */

// Quais passos existem, em ordem. "opcional": não conta para o cartão sumir (nem toda empresa recruta pelo sistema).
const PRIMEIROS_PASSOS_RS_DEF = [
  {
    id: 'empresa',
    titulo: 'Complete o cadastro da empresa',
    porque: 'A razão social e o CNPJ aparecem nos relatórios, nos e-mails e nos documentos.',
    rota: 'empresa',
  },
  {
    id: 'estrutura',
    titulo: 'Monte a estrutura organizacional',
    porque: 'Unidades e setores: é onde cada pessoa e cada cargo se encaixa.',
    rota: 'estrutura',
  },
  {
    id: 'cultura',
    titulo: 'Preencha a cultura (missão, visão e valores)',
    porque: 'Os valores viram critérios nas avaliações e nas vagas.',
    rota: 'cultura',
  },
  {
    id: 'cargos',
    titulo: 'Publique pelo menos um cargo',
    porque: 'O desenho do cargo define o que se espera de quem o ocupa e alimenta as avaliações.',
    rota: 'cargos',
  },
  {
    id: 'usuarios',
    titulo: 'Convide mais uma pessoa (RH, gestor ou colaborador)',
    porque: 'Cada papel enxerga só o que precisa para trabalhar.',
    rota: 'usuarios',
  },
  {
    id: 'colaboradores',
    titulo: 'Cadastre seus colaboradores',
    porque: 'É a partir deles que o sistema abre as avaliações e os planos de desenvolvimento.',
    rota: 'colaboradores',
  },
  {
    id: 'ciclos',
    titulo: 'Abra o primeiro ciclo de avaliação',
    porque: 'É aqui que o sistema começa a gerar resultado: notas, diagnóstico e planos.',
    rota: 'ciclos',
  },
  {
    id: 'recrutamento',
    titulo: 'Abra a primeira vaga no recrutamento',
    porque: 'Monte o processo seletivo e receba candidaturas por um link.',
    rota: 'rs_processo',
    opcional: true,
  },
];

// Estado da empresa -> lista de passos com "feito", contagens, percentual e o próximo passo obrigatório.
function calcularPrimeirosPassosRS(dados) {
  const d = dados || {};
  const feito = {
    empresa: !!(d.empresa && (d.empresa.estado === 'Ativa' || (d.empresa.razaoSocial && d.empresa.cnpj))),
    estrutura: (d.estrutura || []).length > 0,
    cultura: !!(d.cultura && d.cultura.missao),
    cargos: (d.cargos || []).some((c) => c.desenho && c.desenho.aprovado),
    usuarios: (d.perfisEmpresa || []).length >= 2,
    colaboradores: (d.colaboradores || []).some((c) => !c.inativo),
    ciclos: (d.ciclos || []).length > 0,
    recrutamento: !!(d.rs && (d.rs.requisicoes || []).length > 0),
  };
  const passos = PRIMEIROS_PASSOS_RS_DEF.map((p) => ({ ...p, opcional: !!p.opcional, feito: !!feito[p.id] }));
  const obrigatorios = passos.filter((p) => !p.opcional);
  const concluidosObrigatorios = obrigatorios.filter((p) => p.feito).length;
  const proximo = obrigatorios.find((p) => !p.feito) || null;
  return {
    passos,
    concluidos: passos.filter((p) => p.feito).length,
    total: passos.length,
    obrigatorios: obrigatorios.length,
    concluidosObrigatorios,
    percentual: Math.round((concluidosObrigatorios / obrigatorios.length) * 100),
    completo: concluidosObrigatorios === obrigatorios.length,
    proximo,
  };
}

function ocultarPrimeirosPassosRS() {
  state.configuracoes = state.configuracoes || {};
  state.configuracoes.onboardingOculto = true;
  if (typeof agendarSalvamento === 'function') agendarSalvamento();
  render();
}

// O cartão. Some quando não há mais nada obrigatório a fazer ou quando a pessoa o oculta.
function renderPrimeirosPassos() {
  if (state.configuracoes && state.configuracoes.onboardingOculto) return '';
  const r = calcularPrimeirosPassosRS({
    empresa: state.empresa,
    estrutura: state.estrutura,
    cultura: state.cultura,
    cargos: state.cargos,
    colaboradores: state.colaboradores,
    ciclos: state.ciclos,
    rs: state.rs,
    perfisEmpresa: typeof _perfisEmpresa !== 'undefined' ? _perfisEmpresa : [],
  });
  if (r.completo) return '';
  const e = escaparHtml;
  const primeiroAcesso = r.concluidosObrigatorios === 0;
  const linhas = r.passos
    .map((p) => {
      const ehProximo = r.proximo && r.proximo.id === p.id;
      const botao = p.feito
        ? ''
        : `<button class="btn btn-sm ${ehProximo ? 'btn-primary' : 'btn-ghost'}" onclick="goto('${p.rota}')">${ehProximo ? 'Fazer agora' : 'Ir'}</button>`;
      return `<li style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);${p.feito ? 'opacity:.7;' : ''}">
        <div style="min-width:0;">
          <div style="${p.feito ? 'text-decoration:line-through;color:var(--ink-faint);' : 'font-weight:600;'}"><span aria-hidden="true">${p.feito ? '✓' : '○'}</span> ${e(p.titulo)}${p.feito ? '<span class="sr-only"> (concluído)</span>' : ''}${p.opcional ? ' <span class="pill pill-neutral">opcional</span>' : ''}${ehProximo ? ' <span class="pill pill-desenvolver">próximo</span>' : ''}</div>
          ${p.feito ? '' : `<div class="small-muted" style="font-size:12.5px;margin-top:2px;">${e(p.porque)}</div>`}
        </div>
        ${botao}
      </li>`;
    })
    .join('');
  return `<div class="card" style="border-left:3px solid var(--gold);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
      <div>
        <h3 style="margin:0;">${primeiroAcesso ? 'Bem-vindo(a)! Vamos configurar a sua empresa' : 'Primeiros passos'} <small>${r.concluidosObrigatorios} de ${r.obrigatorios} concluídos</small></h3>
        <div class="small-muted" style="margin-top:4px;">${primeiroAcesso ? 'São poucos passos, na ordem que você quiser: o sistema marca sozinho o que você já fez.' : 'O sistema marca sozinho o que você já fez.'}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="ocultarPrimeirosPassosRS()">Ocultar</button>
    </div>
    <div role="progressbar" aria-label="Progresso dos primeiros passos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.percentual}" style="margin:12px 0 4px;height:6px;background:var(--surface-2);border-radius:99px;overflow:hidden;">
      <div style="height:100%;width:${r.percentual}%;background:var(--gold);border-radius:99px;"></div>
    </div>
    <ol style="list-style:none;margin:8px 0 0;padding:0;">${linhas}</ol>
  </div>`;
}
