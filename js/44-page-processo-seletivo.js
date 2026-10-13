/* =========================================================
   R&S — PROCESSO SELETIVO (visão geral)
   -----------------------------------------------------------
   Uma tela só pra enxergar e ajustar o processo seletivo da empresa:
   1) as ETAPAS que o candidato percorre, na ordem, com quantos candidatos estão em cada uma agora;
   2) as ORIENTAÇÕES e LINKS de cada etapa (ex.: onde fazer o teste DISC), que vão no e-mail do candidato;
   3) quais etapas cada VAGA usa.

   O catálogo de etapas, as regras por vaga e a configuração das orientações ficam em js/45-rs-etapas.js;
   o funil de candidatos de cada vaga fica em R&S (js/40). Só Administrador e RH acessam esta tela.

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const TIPO_ETAPA_ROTULO_RS = {
  registro: 'Registro de resultado',
  entrevista: 'Entrevista',
  video: 'Vídeo de apresentação',
};

function etapaTipoRotuloRS(etapa) {
  if (etapa.interna) return 'Verificação interna';
  if (etapa.fixa) return 'Fixa em toda vaga';
  return TIPO_ETAPA_ROTULO_RS[etapa.tipo] || 'Etapa do funil';
}

// Quantos candidatos estão em cada etapa AGORA (quem foi reprovado/desistiu não conta).
function contagemPorEtapaRS(candidatos) {
  const contagem = {};
  for (const c of candidatos || []) {
    if (c.reprovado) continue;
    contagem[c.etapa] = (contagem[c.etapa] || 0) + 1;
  }
  return contagem;
}

// Resumo de cada vaga em andamento: quais etapas usa e quantos candidatos ativos tem.
function resumoVagasProcessoRS(rs, cargos) {
  const candidatos = (rs && rs.candidatos) || [];
  return ((rs && rs.requisicoes) || [])
    .filter((r) => !r.encerrada)
    .map((r) => {
      const ativas = etapasAtivasDaVagaRS(r);
      return {
        id: r.id,
        codigo: r.codigo,
        nome: (cargos || []).find((c) => c.id === r.cargoId)?.nome || r.codigo,
        usaTodas: ativas.length === ETAPAS_RS.length,
        provaPratica: situacaoProvaPraticaRS(r),
        etapas: ativas.filter((e) => !e.fixa).map((e) => e.nome),
        candidatos: candidatos.filter((c) => c.vagaId === r.id && !c.reprovado).length,
      };
    });
}

function pageProcessoSeletivoRS() {
  if (!['owner', 'rh'].includes(meuPapelReal))
    return '<div class="empty">Só o Administrador e o RH acessam o processo seletivo.</div>';
  garantirRS();
  const e = escaparHtml;
  const contagem = contagemPorEtapaRS(state.rs.candidatos);
  const cfgs = state.rs.configEtapas || {};
  const vagas = resumoVagasProcessoRS(state.rs, state.cargos);
  let numero = 2; // as etapas 1 (perfil da vaga) e 2 (divulgação) são da vaga; a numeração segue a lista da empresa a partir da 3

  const linhasEtapas = ETAPAS_RS.map((et) => {
    const num = et.fixa ? '—' : ++numero;
    const emailTexto = et.interna ? 'não' : 'sim';
    const configurada = !et.fixa && !et.interna && temOrientacoesEtapaRS(cfgs[et.id]);
    return `<tr>
      <td>${num}</td>
      <td><b>${e(et.nome)}</b></td>
      <td>${e(etapaTipoRotuloRS(et))}</td>
      <td>${emailTexto}</td>
      <td>${ETAPAS_SO_POR_VAGA_RS.includes(et.id) ? '<span class="pill pill-neutral">definida em cada vaga</span>' : et.fixa || et.interna ? '<span class="small-muted">—</span>' : configurada ? '<span class="pill pill-alavancar">configuradas</span>' : '<span class="pill pill-neutral">sem orientações</span>'}</td>
      <td><b>${contagem[et.id] || 0}</b></td>
    </tr>`;
  }).join('');

  const linhasVagas = vagas.length
    ? vagas
        .map(
          (v) => `<tr>
      <td><b>${e(v.nome)}</b> <span class="small-muted">(${e(v.codigo)})</span></td>
      <td>${v.usaTodas ? 'Todas as etapas' : v.etapas.length ? v.etapas.map((n) => `<span class="pill pill-neutral" style="margin:0 4px 4px 0;">${e(n)}</span>`).join('') : '<span class="small-muted">Só as etapas fixas</span>'}</td>
      <td>${v.candidatos}</td>
      <td>${provaPraticaPillRS(v.provaPratica)}</td>
    </tr>`
        )
        .join('')
    : '';

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Processo seletivo</h1>
      <p class="page-desc">As etapas que o candidato percorre, as orientações que ele recebe em cada uma e as etapas que cada vaga usa.</p>
      <div class="notice info" style="margin-top:10px;">As etapas <b>1 (perfil da vaga)</b> e <b>2 (divulgação)</b> são da <b>vaga</b>: ficam na requisição de vaga e na página pública de candidatura. O <b>DISC e o GALT</b> são feitos fora do sistema, pelos links que você indicar nas orientações. Na verificação de <b>redes sociais</b> e na <b>checagem do currículo</b>, registre e decida só com base no que se relaciona com a vaga. Os resultados das etapas são apoio à sua decisão.</div>
    </div>

    <div class="card">
      <h3>Etapas do processo</h3>
      <table><thead><tr><th>#</th><th>Etapa</th><th>Tipo</th><th>E-mail ao candidato</th><th>Orientações</th><th>Candidatos agora</th></tr></thead><tbody>${linhasEtapas}</tbody></table>
    </div>

    <div class="card">
      <h3>Orientações e links das etapas</h3>
      ${rsConfigEtapasPainelHtml()}
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;">
        <h3 style="margin:0;">Etapas por vaga</h3>
        <button class="btn btn-ghost btn-sm" onclick="goto('rs')">Abrir R&S →</button>
      </div>
      ${
        vagas.length
          ? `<table><thead><tr><th>Vaga</th><th>Etapas que usa (além das fixas)</th><th>Candidatos ativos</th><th>Prova prática</th></tr></thead><tbody>${linhasVagas}</tbody></table>
             <p class="small-muted" style="margin:8px 0 0;">Para mudar as etapas de uma vaga, abra a vaga em R&S → <b>Etapas do processo desta vaga</b>.</p>`
          : '<div class="empty">Nenhuma vaga em andamento. Crie uma requisição de vaga em R&S.</div>'
      }
    </div>
  `;
}

// Situação da prova prática da vaga, em pílula: só aparece como pendente se a vaga USA a etapa e ainda não definiu o enunciado.
function provaPraticaPillRS(situacao) {
  if (situacao === 'definida') return '<span class="pill pill-alavancar">definida</span>';
  if (situacao === 'pendente') return '<span class="pill pill-desenvolver">pendente</span>';
  return '<span class="small-muted">não usa</span>';
}
