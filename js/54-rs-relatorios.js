/* =========================================================
   R&S — RELATÓRIOS DO RECRUTAMENTO
   -----------------------------------------------------------
   Tudo é calculado do HISTÓRICO que o sistema já guarda de cada candidato (cada movimentação de etapa tem data), sem
   pedir nenhum dado novo:
     - FUNIL: quantos candidatos chegaram a cada etapa e que parte avança da etapa anterior;
     - TEMPO EM CADA ETAPA: média e mediana de dias (só movimentos já concluídos) e quem está PARADO há mais de 7 dias
       (é onde está o gargalo);
     - ORIGEM: de que canal vêm os candidatos e quais chegam à decisão e à contratação;
     - REPROVAÇÕES: em que etapa e por qual motivo (o motivo é texto livre digitado por quem reprovou);
     - POR VAGA e RESUMO (vagas, candidatos, tempo de contratação, taxa de aceite);
     - exportação para planilha (CSV).
   Filtros: uma vaga ou todas; todo o período ou os últimos 30, 90 ou 365 dias (pela data em que o candidato entrou).

   Limites que a tela avisa: candidatos antigos podem ter lacunas no histórico; amostras com menos de 5 casos são só
   indicativas; o motivo da reprovação é texto livre (não é categorizado).

   O começo do arquivo são funções PURAS (sem tela, sem relógio: a data de hoje entra como parâmetro), testadas.
   ========================================================= */

const RELATORIO_RS_PARADO_DIAS = 7; // quantos dias numa etapa já é "parado"
const RELATORIO_RS_AMOSTRA_MINIMA = 5; // abaixo disso a tela avisa "poucos dados"
const DIA_MS_RELATORIO_RS = 86400000;

function normalizarTextoRelatorioRS(t) {
  return String(t == null ? '' : t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function dataMsRelatorioRS(v) {
  const ms = v ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
function arredondarRelatorioRS(n) {
  return Math.round(n * 10) / 10;
}
function medianaRelatorioRS(valores) {
  const v = valores.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Movimentações válidas do candidato, em ordem de data: só as que têm data e uma etapa de destino.
function movimentosDoCandidatoRS(c) {
  return (c.historico || [])
    .map((h) => ({
      de: h.de || null,
      para: h.para || null,
      em: dataMsRelatorioRS(h.em),
      observacao: h.observacao || '',
    }))
    .filter((h) => h.em !== null && h.para)
    .sort((a, b) => a.em - b.em);
}

// Todas as etapas em que o candidato já esteve: as do histórico mais a atual ("reprovado" não é etapa).
function etapasAlcancadasRS(c) {
  const alcancadas = new Set();
  (c.historico || []).forEach((h) => {
    if (h.para && h.para !== 'reprovado') alcancadas.add(h.para);
  });
  if (c.etapa) alcancadas.add(c.etapa);
  return alcancadas;
}

// Quando o candidato entrou no processo: a data mais antiga que se conhece (histórico ou criação).
function dataEntradaCandidatoRS(c) {
  const datas = [dataMsRelatorioRS(c.criadoEm), ...(c.historico || []).map((h) => dataMsRelatorioRS(h.em))].filter(
    (d) => d !== null
  );
  return datas.length ? Math.min(...datas) : null;
}

// Candidatos que entram no relatório: os que estão em um processo seletivo, da vaga escolhida e do período escolhido.
function filtrarCandidatosRelatorioRS({ candidatos, vagaId, dias, agora }) {
  let lista = (candidatos || []).filter((c) => c.vagaId);
  if (vagaId) lista = lista.filter((c) => c.vagaId === vagaId);
  let semData = 0;
  if (dias) {
    const desde = agora - dias * DIA_MS_RELATORIO_RS;
    lista = lista.filter((c) => {
      const entrada = dataEntradaCandidatoRS(c);
      if (entrada === null) {
        semData++;
        return false; // sem data não dá para saber se cabe no período
      }
      return entrada >= desde;
    });
  }
  return { candidatos: lista, semData };
}

// FUNIL. Com uma vaga: só as etapas que ela usa. Sem vaga (todas): as etapas que alguém alcançou.
function funilRelatorioRS(candidatos, vaga) {
  const total = candidatos.length;
  const alcancadas = candidatos.map(etapasAlcancadasRS);
  const catalogo = vaga ? etapasAtivasDaVagaRS(vaga) : ETAPAS_RS;
  const etapas = [];
  let anterior = null;
  for (const e of catalogo) {
    const chegaram = alcancadas.filter((s) => s.has(e.id)).length;
    if (!vaga && chegaram === 0 && e.id !== 'nova') continue;
    etapas.push({
      id: e.id,
      nome: etapaNomeRS(e.id),
      chegaram,
      pctDoTotal: total ? Math.round((chegaram / total) * 100) : null,
      pctDaAnterior: anterior && anterior.chegaram ? Math.round((chegaram / anterior.chegaram) * 100) : null,
    });
    anterior = etapas[etapas.length - 1];
  }
  return {
    total,
    etapas,
    reprovados: candidatos.filter((c) => c.reprovado).length,
    contratados: candidatos.filter((c) => c.convertidoEm).length,
  };
}

// TEMPO EM CADA ETAPA. Só os movimentos CONCLUÍDOS entram na média; quem ainda está na etapa conta à parte e, passando de
// RELATORIO_RS_PARADO_DIAS dias, vai para a lista de parados.
function tempoPorEtapaRelatorioRS(candidatos, agora) {
  const duracoes = {};
  const emAndamento = {};
  const parados = [];
  for (const c of candidatos) {
    const mov = movimentosDoCandidatoRS(c);
    mov.forEach((m, i) => {
      if (m.para === 'reprovado') return;
      const proximo = mov[i + 1];
      if (proximo) {
        const dias = (proximo.em - m.em) / DIA_MS_RELATORIO_RS;
        if (dias >= 0) (duracoes[m.para] = duracoes[m.para] || []).push(dias);
        return;
      }
      // último movimento: se o candidato ainda está nessa etapa e o processo dele não acabou, está "em andamento"
      if (!c.reprovado && !c.convertidoEm && c.etapa === m.para && m.para !== 'aprovado') {
        const dias = Math.max(0, (agora - m.em) / DIA_MS_RELATORIO_RS);
        emAndamento[m.para] = (emAndamento[m.para] || 0) + 1;
        if (dias > RELATORIO_RS_PARADO_DIAS)
          parados.push({
            candidatoId: c.id,
            nome: c.nome,
            vagaId: c.vagaId,
            etapa: m.para,
            nomeEtapa: etapaNomeRS(m.para),
            dias: Math.floor(dias),
          });
      }
    });
  }
  const etapas = [];
  for (const e of ETAPAS_RS) {
    const d = duracoes[e.id] || [];
    const andamento = emAndamento[e.id] || 0;
    if (!d.length && !andamento) continue;
    etapas.push({
      id: e.id,
      nome: etapaNomeRS(e.id),
      amostras: d.length,
      mediaDias: d.length ? arredondarRelatorioRS(d.reduce((a, b) => a + b, 0) / d.length) : null,
      medianaDias: d.length ? arredondarRelatorioRS(medianaRelatorioRS(d)) : null,
      emAndamento: andamento,
      parados: parados.filter((p) => p.etapa === e.id).length,
    });
  }
  parados.sort((a, b) => b.dias - a.dias || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { etapas, parados };
}

// ORIGEM dos candidatos (agrupa "LinkedIn", "linkedin " e "Linkedin"; sem origem vira "Sem origem").
function origemRelatorioRS(candidatos) {
  const decisao = new Set(['escolha', 'proposta', 'aprovado']);
  const grupos = new Map();
  for (const c of candidatos) {
    const bruto = String(c.origem || '').trim();
    const chave = normalizarTextoRelatorioRS(bruto) || '__sem__';
    if (!grupos.has(chave))
      grupos.set(chave, { origem: bruto || 'Sem origem', total: 0, naDecisao: 0, contratados: 0, reprovados: 0 });
    const g = grupos.get(chave);
    g.total++;
    if ([...etapasAlcancadasRS(c)].some((e) => decisao.has(e))) g.naDecisao++;
    if (c.convertidoEm) g.contratados++;
    if (c.reprovado) g.reprovados++;
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total || a.origem.localeCompare(b.origem, 'pt-BR'));
}

// REPROVAÇÕES: em que etapa e por qual motivo (texto livre, agrupado ignorando maiúsculas e acentos).
function reprovacoesRelatorioRS(candidatos) {
  const porEtapa = {};
  const motivos = new Map();
  let total = 0;
  for (const c of candidatos) {
    if (!c.reprovado) continue;
    total++;
    const evento = movimentosDoCandidatoRS(c)
      .filter((m) => m.para === 'reprovado')
      .pop();
    const etapa = (evento && evento.de) || c.etapa || 'nova';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
    const bruto = String((evento && evento.observacao) || '').trim();
    const chave = normalizarTextoRelatorioRS(bruto) || '__sem__';
    if (!motivos.has(chave)) motivos.set(chave, { motivo: bruto || 'Sem motivo informado', total: 0 });
    motivos.get(chave).total++;
  }
  return {
    total,
    porEtapa: ETAPAS_RS.filter((e) => porEtapa[e.id]).map((e) => ({
      id: e.id,
      nome: etapaNomeRS(e.id),
      total: porEtapa[e.id],
    })),
    motivos: [...motivos.values()]
      .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo, 'pt-BR'))
      .slice(0, 10),
  };
}

// Tempo de contratação: da publicação da vaga até a contratação (o mesmo critério do indicador que já existe no Processo seletivo).
function tempoContratacaoRelatorioRS(requisicoes, candidatos) {
  const dias = [];
  for (const r of requisicoes) {
    const pub = dataMsRelatorioRS(r.publicadaEm);
    const contratacoes = candidatos
      .filter((c) => c.vagaId === r.id && c.convertidoEm)
      .map((c) => dataMsRelatorioRS(c.convertidoEm))
      .filter((d) => d !== null);
    if (pub === null || !contratacoes.length) continue;
    const d = (Math.min(...contratacoes) - pub) / DIA_MS_RELATORIO_RS;
    if (d >= 0) dias.push(d);
  }
  return {
    amostras: dias.length,
    mediaDias: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
  };
}

// Cada vaga aprovada com os seus números.
function vagasRelatorioRS(requisicoes, candidatos, cargos, agora) {
  return requisicoes
    .filter((r) => r.status === 'aprovada')
    .map((r) => {
      const dela = candidatos.filter((c) => c.vagaId === r.id);
      const cargo = (cargos || []).find((k) => k.id === r.cargoId);
      const tempo = tempoPorEtapaRelatorioRS(dela, agora);
      return {
        id: r.id,
        codigo: r.codigo,
        cargo: cargo ? cargo.nome : '—',
        situacao: r.encerrada ? 'Encerrada' : r.publicada ? 'Aberta e publicada' : 'Aprovada (não publicada)',
        candidatos: dela.length,
        ativos: dela.filter((c) => !c.reprovado).length,
        reprovados: dela.filter((c) => c.reprovado).length,
        contratados: dela.filter((c) => c.convertidoEm).length,
        parados: tempo.parados.length,
      };
    });
}

// O relatório inteiro, para uma vaga (ou todas) e um período (ou todo).
function montarRelatorioRS({ requisicoes, candidatos, cargos, vagaId, dias, agora }) {
  const filtro = filtrarCandidatosRelatorioRS({ candidatos, vagaId: vagaId || null, dias: dias || 0, agora });
  const lista = filtro.candidatos;
  const vaga = vagaId ? requisicoes.find((r) => r.id === vagaId) || null : null;
  const passaramPorProposta = lista.filter((c) => (c.historico || []).some((h) => h.para === 'proposta'));
  const aceitaram = passaramPorProposta.filter((c) => c.etapa === 'aprovado' && !c.reprovado).length;
  const vagasAprovadas = requisicoes.filter((r) => r.status === 'aprovada');
  const tempoContratacao = tempoContratacaoRelatorioRS(vaga ? [vaga] : vagasAprovadas, lista);
  return {
    filtro: { vagaId: vagaId || null, dias: dias || 0, semData: filtro.semData },
    resumo: {
      vagas: vaga ? 1 : vagasAprovadas.length,
      vagasAbertas: (vaga ? [vaga] : vagasAprovadas).filter((r) => !r.encerrada).length,
      candidatos: lista.length,
      ativos: lista.filter((c) => !c.reprovado).length,
      reprovados: lista.filter((c) => c.reprovado).length,
      contratados: lista.filter((c) => c.convertidoEm).length,
      tempoContratacaoDias: tempoContratacao.mediaDias,
      tempoContratacaoAmostras: tempoContratacao.amostras,
      taxaAceite: passaramPorProposta.length ? Math.round((aceitaram / passaramPorProposta.length) * 100) : null,
      propostas: passaramPorProposta.length,
    },
    funil: funilRelatorioRS(lista, vaga),
    tempo: tempoPorEtapaRelatorioRS(lista, agora),
    origem: origemRelatorioRS(lista),
    reprovacoes: reprovacoesRelatorioRS(lista),
    vagas: vagasRelatorioRS(vaga ? [vaga] : requisicoes, lista, cargos, agora),
  };
}

// ---------- exportação (CSV para o Excel brasileiro: ";" e vírgula decimal) ----------
// Uma célula que começa com = + - @ (ou tabulação) seria interpretada como FÓRMULA pelo Excel: ganha uma aspa na frente.
function celulaCsvRelatorioRS(v) {
  let t = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/^[=+\-@\t\r]/.test(t) && typeof v !== 'number') t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function relatorioParaCsvRS(r) {
  const linhas = [];
  const add = (...cels) => linhas.push(cels.map(celulaCsvRelatorioRS).join(';'));
  const filtroTexto = `${r.filtro.vagaId ? 'uma vaga' : 'todas as vagas'}; ${r.filtro.dias ? `últimos ${r.filtro.dias} dias` : 'todo o período'}`;
  add('Relatório do recrutamento');
  add('Filtro', filtroTexto);
  add();
  add('RESUMO');
  add('Vagas', r.resumo.vagas);
  add('Vagas abertas', r.resumo.vagasAbertas);
  add('Candidatos', r.resumo.candidatos);
  add('Em andamento', r.resumo.ativos);
  add('Reprovados ou desistentes', r.resumo.reprovados);
  add('Contratados', r.resumo.contratados);
  add('Tempo médio de contratação (dias)', r.resumo.tempoContratacaoDias);
  add('Taxa de aceite da proposta (%)', r.resumo.taxaAceite);
  add();
  add('FUNIL');
  add('Etapa', 'Chegaram', '% do total', '% da etapa anterior');
  r.funil.etapas.forEach((e) => add(e.nome, e.chegaram, e.pctDoTotal, e.pctDaAnterior));
  add();
  add('TEMPO EM CADA ETAPA');
  add(
    'Etapa',
    'Média (dias)',
    'Mediana (dias)',
    'Casos concluídos',
    'Estão na etapa agora',
    `Parados há mais de ${RELATORIO_RS_PARADO_DIAS} dias`
  );
  r.tempo.etapas.forEach((e) => add(e.nome, e.mediaDias, e.medianaDias, e.amostras, e.emAndamento, e.parados));
  add();
  add('ORIGEM DOS CANDIDATOS');
  add('Origem', 'Candidatos', 'Chegaram à decisão', 'Contratados', 'Reprovados');
  r.origem.forEach((o) => add(o.origem, o.total, o.naDecisao, o.contratados, o.reprovados));
  add();
  add('REPROVAÇÕES POR ETAPA');
  add('Etapa', 'Reprovados');
  r.reprovacoes.porEtapa.forEach((e) => add(e.nome, e.total));
  add();
  add('MOTIVOS DE REPROVAÇÃO (texto livre)');
  add('Motivo', 'Quantidade');
  r.reprovacoes.motivos.forEach((m) => add(m.motivo, m.total));
  add();
  add('POR VAGA');
  add('Código', 'Cargo', 'Situação', 'Candidatos', 'Em andamento', 'Reprovados', 'Contratados', 'Parados');
  r.vagas.forEach((v) =>
    add(v.codigo, v.cargo, v.situacao, v.candidatos, v.ativos, v.reprovados, v.contratados, v.parados)
  );
  return `\ufeff${linhas.join('\r\n')}\r\n`;
}

// ---------- a tela ----------
let _rsRelatorioFiltro = { vagaId: '', dias: 0 };

function filtrarRelatorioRS(campo, valor) {
  if (campo === 'vaga') _rsRelatorioFiltro.vagaId = valor || '';
  if (campo === 'dias') _rsRelatorioFiltro.dias = [30, 90, 365].includes(Number(valor)) ? Number(valor) : 0;
  render();
}

function relatorioAtualRS() {
  return montarRelatorioRS({
    requisicoes: state.rs.requisicoes,
    candidatos: state.rs.candidatos,
    cargos: state.cargos,
    vagaId: _rsRelatorioFiltro.vagaId,
    dias: _rsRelatorioFiltro.dias,
    agora: Date.now(),
  });
}

function exportarRelatorioRS() {
  const r = relatorioAtualRS();
  const url = URL.createObjectURL(new Blob([relatorioParaCsvRS(r)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-recrutamento-${hojeLocalISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (typeof registrarAuditoria === 'function')
    registrarAuditoria('rs.relatorio_exportado', { candidatos: r.resumo.candidatos, vagas: r.resumo.vagas });
}

// Abre a ficha de um candidato parado, no Processo seletivo.
function abrirCandidatoDoRelatorioRS(candidatoId, vagaId) {
  _rsRequisicaoExpandida = vagaId || null;
  _psFichaAberta = candidatoId;
  goto('rs_processo');
}

function pageRelatoriosRS() {
  if (!['owner', 'rh'].includes(meuPapelReal))
    return '<div class="empty">Você não tem acesso aos relatórios do recrutamento.</div>';
  garantirRS();
  const e = escaparHtml;
  const r = relatorioAtualRS();
  const vagas = state.rs.requisicoes.filter((v) => v.status === 'aprovada');
  const nomeVaga = (v) =>
    `${v.codigo} — ${(state.cargos.find((c) => c.id === v.cargoId) || {}).nome || 'vaga'}${v.encerrada ? ' (encerrada)' : ''}`;
  const kpi = (rotulo, valor, nota) =>
    `<div class="card" style="padding:12px 14px;margin:0;"><div class="small-muted">${e(rotulo)}</div><div style="font-size:22px;font-weight:700;">${e(valor)}</div>${nota ? `<div class="small-muted" style="font-size:12px;">${e(nota)}</div>` : ''}</div>`;
  const dash = (v, sufixo) => (v === null || v === undefined ? '—' : `${v}${sufixo || ''}`);
  const poucos = (n) =>
    n < RELATORIO_RS_AMOSTRA_MINIMA
      ? ' <span class="pill pill-neutral" title="Menos de 5 casos: é só uma indicação">poucos dados</span>'
      : '';
  const barra = (pct) =>
    `<div aria-hidden="true" style="background:var(--surface-2);border-radius:99px;height:10px;min-width:90px;"><div style="width:${pct || 0}%;height:100%;background:var(--gold);border-radius:99px;"></div></div>`;
  const tabela = (legenda, cabecalho, linhas, vazio) =>
    linhas.length
      ? `<div style="overflow-x:auto;"><table><caption class="sr-only">${e(legenda)}</caption><thead><tr>${cabecalho.map((c) => `<th scope="col">${e(c)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
      : `<div class="small-muted">${e(vazio)}</div>`;
  const secao = (titulo, ajuda, corpo) =>
    `<div class="card"><h3 style="margin:0 0 2px;">${e(titulo)}</h3>${ajuda ? `<div class="small-muted" style="margin-bottom:10px;">${e(ajuda)}</div>` : ''}${corpo}</div>`;

  const semCandidatos = r.resumo.candidatos === 0;
  const funil = tabela(
    'Funil: quantos candidatos chegaram a cada etapa',
    ['Etapa', 'Chegaram', '% do total', '% da etapa anterior', ''],
    r.funil.etapas.map(
      (et) =>
        `<tr><td>${e(et.nome)}</td><td><b>${et.chegaram}</b></td><td>${dash(et.pctDoTotal, '%')}</td><td>${dash(et.pctDaAnterior, '%')}</td><td style="width:30%;">${barra(et.pctDoTotal)}</td></tr>`
    ),
    'Sem candidatos neste filtro.'
  );
  const tempo = tabela(
    'Tempo em cada etapa',
    [
      'Etapa',
      'Média (dias)',
      'Mediana (dias)',
      'Casos concluídos',
      'Estão na etapa agora',
      `Parados há mais de ${RELATORIO_RS_PARADO_DIAS} dias`,
    ],
    r.tempo.etapas.map(
      (et) =>
        `<tr><td>${e(et.nome)}</td><td>${dash(et.mediaDias)}</td><td>${dash(et.medianaDias)}</td><td>${et.amostras}${et.amostras ? poucos(et.amostras) : ''}</td><td>${et.emAndamento}</td><td>${et.parados ? `<b>${et.parados}</b>` : 0}</td></tr>`
    ),
    'Ainda não há movimentações suficientes para calcular o tempo.'
  );
  const parados = r.tempo.parados.length
    ? `<h4 style="margin:14px 0 6px;font-size:13px;">Candidatos parados (os mais antigos primeiro)</h4>` +
      tabela(
        'Candidatos parados',
        ['Candidato', 'Etapa', 'Dias parado', ''],
        r.tempo.parados
          .slice(0, 10)
          .map(
            (p) =>
              `<tr><td>${e(p.nome)}</td><td>${e(p.nomeEtapa)}</td><td><b>${p.dias}</b></td><td><button class="btn btn-sm btn-ghost" onclick="abrirCandidatoDoRelatorioRS('${escaparParaOnclick(p.candidatoId)}', ${p.vagaId ? `'${escaparParaOnclick(p.vagaId)}'` : 'null'})">Abrir ficha</button></td></tr>`
          ),
        ''
      ) +
      (r.tempo.parados.length > 10 ? `<div class="small-muted">Mostrando 10 de ${r.tempo.parados.length}.</div>` : '')
    : '';
  const origem = tabela(
    'Origem dos candidatos',
    ['Origem', 'Candidatos', 'Chegaram à decisão', 'Contratados', 'Reprovados'],
    r.origem.map(
      (o) =>
        `<tr><td>${e(o.origem)}</td><td><b>${o.total}</b></td><td>${o.naDecisao}</td><td>${o.contratados}</td><td>${o.reprovados}</td></tr>`
    ),
    'Sem candidatos neste filtro.'
  );
  const reprovacoes = r.reprovacoes.total
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;"><div>${tabela(
        'Reprovações por etapa',
        ['Etapa', 'Reprovados'],
        r.reprovacoes.porEtapa.map((x) => `<tr><td>${e(x.nome)}</td><td><b>${x.total}</b></td></tr>`),
        ''
      )}</div><div>${tabela(
        'Motivos de reprovação',
        ['Motivo (texto livre)', 'Quantidade'],
        r.reprovacoes.motivos.map((m) => `<tr><td>${e(m.motivo)}</td><td><b>${m.total}</b></td></tr>`),
        ''
      )}</div></div>`
    : '<div class="small-muted">Nenhuma reprovação neste filtro.</div>';
  const porVaga = tabela(
    'Números por vaga',
    ['Vaga', 'Situação', 'Candidatos', 'Em andamento', 'Reprovados', 'Contratados', 'Parados'],
    r.vagas.map(
      (v) =>
        `<tr><td>${e(v.codigo)} — ${e(v.cargo)}</td><td>${e(v.situacao)}</td><td>${v.candidatos}</td><td>${v.ativos}</td><td>${v.reprovados}</td><td>${v.contratados}</td><td>${v.parados ? `<b>${v.parados}</b>` : 0}</td></tr>`
    ),
    'Nenhuma vaga aprovada ainda.'
  );

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Relatórios</h1>
      <p class="page-desc">Como está o recrutamento: onde os candidatos avançam, onde ficam parados e de onde eles vêm. Calculado do histórico de movimentações do sistema.</p>
    </div>
    <div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <label for="rs_rel_vaga" class="small-muted">Vaga</label>
        <select id="rs_rel_vaga" onchange="filtrarRelatorioRS('vaga', this.value)" style="max-width:300px;"><option value="">Todas as vagas</option>${vagas.map((v) => `<option value="${e(v.id)}" ${_rsRelatorioFiltro.vagaId === v.id ? 'selected' : ''}>${e(nomeVaga(v))}</option>`).join('')}</select>
        <label for="rs_rel_dias" class="small-muted">Período</label>
        <select id="rs_rel_dias" onchange="filtrarRelatorioRS('dias', this.value)">${[
          [0, 'Todo o período'],
          [30, 'Últimos 30 dias'],
          [90, 'Últimos 90 dias'],
          [365, 'Últimos 365 dias'],
        ]
          .map(([v, t]) => `<option value="${v}" ${_rsRelatorioFiltro.dias === v ? 'selected' : ''}>${t}</option>`)
          .join('')}</select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="exportarRelatorioRS()" ${semCandidatos ? 'disabled' : ''}>Exportar para planilha (CSV)</button>
    </div>
    ${r.filtro.semData ? `<div class="notice info" style="margin:8px 0;">${r.filtro.semData} candidato(s) sem data de entrada ficaram de fora deste período (não dá para saber quando entraram).</div>` : ''}
    ${
      semCandidatos
        ? '<div class="card"><div class="empty">Ainda não há candidatos em processos seletivos neste filtro. Leve pessoas do Recrutamento para uma vaga e os relatórios aparecem aqui.</div></div>'
        : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:12px 0;">
        ${kpi('Candidatos', r.resumo.candidatos, `${r.resumo.ativos} em andamento`)}
        ${kpi('Contratados', r.resumo.contratados, `${r.resumo.reprovados} reprovados ou desistentes`)}
        ${kpi('Tempo de contratação', dash(r.resumo.tempoContratacaoDias, ' dias'), r.resumo.tempoContratacaoAmostras ? `média de ${r.resumo.tempoContratacaoAmostras} vaga(s)` : 'ainda sem contratações')}
        ${kpi('Aceite da proposta', dash(r.resumo.taxaAceite, '%'), r.resumo.propostas ? `${r.resumo.propostas} proposta(s)` : 'ainda sem propostas')}
        ${kpi('Parados', r.tempo.parados.length, `há mais de ${RELATORIO_RS_PARADO_DIAS} dias na mesma etapa`)}
      </div>
      ${secao('Funil', 'Quantos candidatos chegaram a cada etapa e que parte avançou da etapa anterior. Quem foi reprovado continua contando nas etapas que alcançou.', funil)}
      ${secao('Tempo em cada etapa', 'Média e mediana só dos movimentos já concluídos; quem ainda está na etapa aparece à parte. É aqui que se vê o gargalo.', tempo + parados)}
      ${secao('Origem dos candidatos', 'De que canal vêm os candidatos e quais chegam à decisão e à contratação.', origem)}
      ${secao('Reprovações', 'Em que etapa os candidatos saem e por qual motivo. O motivo é o texto que quem reprovou digitou.', reprovacoes)}
      ${secao('Por vaga', '', porVaga)}
      <div class="small-muted" style="margin:8px 0 20px;">Como ler: os números vêm do histórico de movimentações registrado no sistema. Candidatos antigos podem ter lacunas, e amostras com menos de ${RELATORIO_RS_AMOSTRA_MINIMA} casos são só uma indicação.</div>`
    }
  `;
}
