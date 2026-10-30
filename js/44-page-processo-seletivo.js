/* =========================================================
   R&S — PROCESSO SELETIVO
   -----------------------------------------------------------
   Aqui acontece TUDO do processo de uma vaga, do começo ao fim:
   1) o passo a passo (as etapas, na ordem da empresa, com quem faz cada uma e quantos candidatos estão nela);
   2) as VAGAS: criar a requisição, aprovar, publicar o link e encerrar — e, em cada vaga, o funil de candidatos
      (mover de etapa, avaliar, reprovar, vídeo, prova prática, contratar);
   3) as orientações e links que o candidato recebe em cada etapa (só Administrador e RH).

   As PESSOAS ficam no cadastro, em "R&S — Recrutamento" (js/47): de lá, a pessoa é levada para a vaga.
   O catálogo de etapas e as regras por vaga ficam em js/45-rs-etapas.js; as vagas e o funil, em js/40.

   Administrador, RH e líderes acessam (o líder pede vagas e acompanha; as orientações das etapas são só do
   Administrador e do RH). O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

// Quem faz e o que acontece em cada etapa — em linguagem de quem usa.
const ETAPA_AJUDA_RS = {
  nova: { quem: 'Sistema', texto: 'Quem se candidata pelo link da vaga entra aqui.' },
  triagem: { quem: 'Você', texto: 'Você analisa os currículos e decide quem segue.' },
  disc_galt: {
    quem: 'Candidato e você',
    texto: 'O candidato faz os testes pelos links que você indicar; você avalia o resultado.',
  },
  video: {
    quem: 'Candidato e você',
    texto: 'O candidato recebe um link e grava um vídeo de até 2 minutos; você assiste.',
  },
  redes_sociais: {
    quem: 'Só você',
    texto: 'Você confere informações públicas ligadas à vaga. O candidato não recebe e-mail.',
  },
  checagem_curriculo: {
    quem: 'Só você',
    texto: 'Você confirma as informações do currículo. O candidato não recebe e-mail.',
  },
  entrevista_fit: { quem: 'Você', texto: 'Você conversa sobre a cultura da empresa e preenche o scorecard.' },
  teste_logico: { quem: 'Candidato e você', texto: 'O candidato faz um teste de raciocínio; você avalia.' },
  prova_teorica: { quem: 'Candidato e você', texto: 'O candidato faz uma prova de conhecimentos; você avalia.' },
  prova_pratica: {
    quem: 'Candidato e você',
    texto: 'Uma tarefa criada para a vaga, com prazo; você avalia pelos critérios.',
  },
  entrevista_final: { quem: 'Você', texto: 'A última conversa com os finalistas.' },
  escolha: { quem: 'Você', texto: 'Você decide quem será contratado.' },
  proposta: { quem: 'Você', texto: 'Você faz a proposta a quem foi escolhido.' },
  aprovado: { quem: 'Você', texto: 'O candidato aceitou: converta em colaborador.' },
};

// Quantos candidatos estão em cada etapa AGORA (quem foi reprovado/desistiu e quem só está cadastrado não conta).
function contagemPorEtapaRS(candidatos) {
  const contagem = {};
  for (const c of candidatos || []) {
    if (c.reprovado || !c.vagaId || !c.etapa) continue;
    contagem[c.etapa] = (contagem[c.etapa] || 0) + 1;
  }
  return contagem;
}

// O passo a passo na ordem da empresa. 1 e 2 são da VAGA; 3 a 13 são as etapas do candidato; proposta e aprovado fecham.
function passosDoProcessoRS(contagem, resumoVagas) {
  const passos = [
    {
      num: '1',
      nome: 'Construção do perfil da vaga',
      quem: 'Você',
      texto: 'Você cria a vaga (cargo, perfil desejado e etapas) e a envia para aprovação.',
      total: resumoVagas ? `${resumoVagas.pendentes} aguardando aprovação` : '',
    },
    {
      num: '2',
      nome: 'Divulgação da vaga',
      quem: 'Você',
      texto: 'Aprovada a vaga, você a publica e copia o link para divulgar.',
      total: resumoVagas ? `${resumoVagas.publicadas} publicada(s)` : '',
    },
  ];
  let n = 2;
  for (const et of ETAPAS_RS) {
    const ajuda = ETAPA_AJUDA_RS[et.id] || { quem: '', texto: '' };
    const numero = et.id === 'nova' ? '' : et.fixa ? '→' : String(++n);
    passos.push({
      num: numero,
      nome: et.nome,
      quem: ajuda.quem,
      texto: ajuda.texto,
      total: String(contagem[et.id] || 0),
      etapaId: et.id,
    });
  }
  // "Nova candidatura" vem logo depois da divulgação (é onde o candidato entra); proposta e aprovado fecham.
  return passos;
}

function pageProcessoSeletivoRS() {
  if (!['owner', 'rh', 'lider'].includes(meuPapelReal))
    return '<div class="empty">Você não tem acesso ao processo seletivo.</div>';
  garantirRS();
  const gestor = ['owner', 'rh'].includes(meuPapelReal);
  const e = escaparHtml;
  const aprovadas = state.rs.requisicoes.filter((r) => r.status === 'aprovada');
  const vaga = vagaSelecionadaRS();
  const nomeDe = (r) =>
    `${r.codigo} — ${state.cargos.find((c) => c.id === r.cargoId)?.nome || 'vaga'}${r.encerrada ? ' (encerrada)' : ''}`;
  const contagem = contagemPorEtapaRS(state.rs.candidatos);
  const resumo = {
    pendentes: state.rs.requisicoes.filter((r) => r.status === 'pendente').length,
    publicadas: state.rs.requisicoes.filter((r) => r.publicada && !r.encerrada).length,
  };
  const linhas = passosDoProcessoRS(contagem, resumo)
    .map(
      (p) =>
        `<tr><td><b>${e(p.num)}</b></td><td><b>${e(p.nome)}</b></td><td>${e(p.quem)}</td><td class="small-muted">${e(p.texto)}</td><td style="white-space:nowrap;"><b>${e(p.total)}</b></td></tr>`
    )
    .join('');
  const vagasAbertas =
    _psVagasAberto ||
    _rsNovaRequisicaoAberta ||
    _rsConfigurarPublicaAberta ||
    !aprovadas.length ||
    state.rs.requisicoes.some((r) => r.status === 'pendente');

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Processo seletivo</h1>
      <p class="page-desc">Cada vaga é um quadro: avance os candidatos pelas fases e clique no nome para abrir a ficha. As pessoas ficam guardadas no <b>Recrutamento</b>.</p>
    </div>

    ${faixaPendenciasHtml(gestor)}

    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 4px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="small-muted">Vaga</span>
        ${
          aprovadas.length
            ? `<select aria-label="Escolher a vaga" onchange="selecionarVagaRS(this.value)" style="max-width:320px;">${aprovadas.map((r) => `<option value="${e(r.id)}" ${vaga && vaga.id === r.id ? 'selected' : ''}>${e(nomeDe(r))}</option>`).join('')}</select>`
            : '<span class="small-muted">nenhuma vaga aprovada ainda</span>'
        }
      </div>
      <span style="display:flex;gap:8px;flex-wrap:wrap;">${gestor ? '<button class="btn btn-ghost btn-sm" onclick="goto(\'rs_relatorios\')">Relatórios</button>' : ''}
      <button class="btn btn-primary btn-sm" onclick="iniciarNovaVagaRS()">+ Nova vaga</button></span>
    </div>

    ${vaga ? renderPipelineCandidatosRS(vaga) : '<div class="card"><div class="empty">Nenhuma vaga aprovada ainda. Clique em "+ Nova vaga", envie para aprovação e, depois de aprovada, ela vira um quadro aqui.</div></div>'}

    <div class="card"><details ${vagasAbertas ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:600;">Vagas: criar, aprovar, publicar o link e encerrar</summary>
      <div style="margin-top:10px;">${rsRequisicoesCardHtml()}</div>
    </details></div>

    <div class="card"><details>
      <summary style="cursor:pointer;font-weight:600;">Como funciona: o passo a passo, da vaga à contratação</summary>
      <div style="margin-top:10px;">
        <table><thead><tr><th>#</th><th>Etapa</th><th>Quem faz</th><th>O que acontece</th><th>Agora</th></tr></thead><tbody>${linhas}</tbody></table>
        <p class="small-muted" style="margin:8px 0 0;">Cada vaga escolhe quais etapas usa ("Nova candidatura", "Proposta" e "Aprovado" valem para toda vaga). O DISC e o GALT são feitos fora do sistema, pelos links que você indicar. Nas etapas de redes sociais e checagem do currículo, use só o que se relaciona com a vaga.</p>
        ${gestor ? renderIndicadoresRS() : ''}
      </div>
    </details></div>

    ${
      gestor
        ? `<div class="card"><details>
      <summary style="cursor:pointer;font-weight:600;">Orientações e links que o candidato recebe em cada etapa (onde fazer o teste DISC, etc.)</summary>
      <div style="margin-top:12px;">${rsConfigEtapasPainelHtml()}</div>
    </details></div>`
        : ''
    }
  `;
}
