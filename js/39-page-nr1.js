/* =========================================================
   MÓDULO NR1 — Riscos Psicossociais (Fase 1: fundação)
   -----------------------------------------------------------
   Regra central da NR1: avalia CONDIÇÕES e ORGANIZAÇÃO do
   trabalho — nunca diagnostica ou classifica uma pessoa.
   Fase 1 (este arquivo): configuração do SST, dimensões/
   perguntas (modelo genérico, sem copiar instrumento
   protegido), e criação/gestão de campanhas. A coleta anônima
   de respostas e o registro de risco entram na Fase 2.

   IMPORTANTE: este módulo é a FERRAMENTA. O conteúdo (perguntas,
   critérios de risco) e as regras de anonimato deste modelo
   ainda não foram homologados por um profissional de SST — não
   publique uma campanha real com um cliente antes dessa validação.
   ========================================================= */

// Modelo genérico de dimensões e perguntas — redigido do zero pelo INETRIS,
// não é cópia de nenhum instrumento comercial/protegido. Serve de ponto de
// partida; a empresa pode editar as perguntas antes de publicar.
const DIMENSOES_NR1_PADRAO = [
  {
    id: 'demandas_carga',
    nome: 'Demandas e carga de trabalho',
    perguntas: [
      'Consigo cumprir minhas tarefas dentro do meu horário de trabalho.',
      'O ritmo de trabalho exigido de mim é adequado, sem pressão excessiva.',
      'Tenho pausas suficientes durante minha jornada.',
    ],
  },
  {
    id: 'autonomia_controle',
    nome: 'Autonomia e controle sobre o trabalho',
    perguntas: [
      'Tenho liberdade para organizar como realizo minhas tarefas.',
      'Sou consultado sobre decisões que afetam meu trabalho.',
      'Posso usar minhas competências e conhecimentos no dia a dia.',
    ],
  },
  {
    id: 'clareza_papel',
    nome: 'Clareza e conflito de papel',
    perguntas: [
      'Sei exatamente o que se espera de mim no meu cargo.',
      'As prioridades do meu trabalho são claras e não mudam sem aviso.',
      'Não recebo pedidos conflitantes de pessoas diferentes.',
    ],
  },
  {
    id: 'apoio_lideranca',
    nome: 'Apoio e liderança',
    perguntas: [
      'Meu gestor está disponível quando preciso de orientação.',
      'Recebo feedback útil sobre meu trabalho.',
      'Posso contar com o apoio dos meus colegas quando necessário.',
    ],
  },
  {
    id: 'reconhecimento',
    nome: 'Reconhecimento e recompensa',
    perguntas: ['Meu esforço e contribuição são reconhecidos.', 'Vejo perspectivas de crescimento no meu trabalho.'],
  },
  {
    id: 'relacoes_violencia',
    nome: 'Relações e violência no trabalho',
    perguntas: [
      'No meu ambiente de trabalho, não presencio nem sofro assédio ou discriminação.',
      'Existe um canal claro para relatar conflitos ou situações de violência no trabalho.',
    ],
  },
  {
    id: 'mudancas_seguranca',
    nome: 'Mudanças e segurança no emprego',
    perguntas: [
      'Mudanças na empresa são comunicadas com clareza e antecedência.',
      'Sinto segurança em relação à continuidade do meu emprego.',
    ],
  },
  {
    id: 'trabalho_vida',
    nome: 'Interface trabalho e vida pessoal',
    perguntas: ['Consigo desconectar do trabalho fora do meu horário.', 'Minha jornada de trabalho é previsível.'],
  },
  {
    id: 'condicoes_execucao',
    nome: 'Condições para execução do trabalho',
    perguntas: [
      'Tenho os recursos e ferramentas necessários para fazer bem meu trabalho.',
      'O ambiente físico de trabalho é adequado (espaço, ruído, iluminação, etc).',
    ],
  },
];

function garantirDimensoesNr1() {
  if (!state.nr1) state.nr1 = { sst: null, dimensoes: null, campanhas: [], riscos: [], acoes: [] };
  if (!state.nr1.dimensoes) {
    // Cópia editável do modelo padrão — a empresa pode alterar sem afetar o padrão global.
    state.nr1.dimensoes = JSON.parse(JSON.stringify(DIMENSOES_NR1_PADRAO));
  }
}

function nr1TemSstNomeado() {
  return !!(state.nr1?.sst?.nome && state.nr1.sst.nome.trim());
}

function salvarSst() {
  const nome = document.getElementById('nr1_sst_nome').value.trim();
  const contato = document.getElementById('nr1_sst_contato').value.trim();
  if (!nome) {
    showToast('Informe o nome do responsável técnico (SST).');
    return;
  }
  state.nr1.sst = { nome, contato, definidoEm: new Date().toISOString() };
  showToast('Responsável técnico (SST) definido. Já é possível publicar campanhas.');
  render();
}

/* ---------- Campanhas, respostas e participação vivem no SERVIDOR ----------
   Diferente de SST/dimensões/riscos (que ficam no navegador), campanhas,
   respostas e quem-já-respondeu passam pela Edge Function "nr1" — o
   navegador nunca recebe o despejo bruto dessas listas, só o que cada ação
   decide devolver. Isso corrige uma limitação de privacidade: antes, a
   lista de participação vivia no mesmo bloco de dados que qualquer usuário
   logado baixa (dava pra ver no Console do navegador quem respondeu, ainda
   que não o quê). Agora não tem como — os dados nem chegam ao navegador. */
let _nr1Campanhas = [];
let _nr1CampanhasCarregando = false;
let _nr1JaCarregouCampanhas = false;
let _nr1MeuStatus = { respondidas: [], aceitas: [] };
let _nr1ResultadosCache = {}; // campanhaId -> { loading, erro, anonimatoMinimo, dimensoesSnapshot, respostas, estrutura, logs }

async function carregarCampanhasNr1() {
  _nr1CampanhasCarregando = true;
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'campanha_listar' } });
  _nr1CampanhasCarregando = false;
  if (!error && data && !data.error) {
    _nr1Campanhas = (data.campanhas || []).map((c) => ({
      id: c.id,
      nome: c.nome,
      dataInicio: c.data_inicio,
      dataFim: c.data_fim,
      anonimatoMinimo: c.anonimato_minimo,
      publico: c.publico,
      dimensoesSnapshot: c.dimensoes_snapshot,
      status: c.status,
      autoEncerrada: c.auto_encerrada,
      criadoEm: c.criado_em,
      totalRespostas: c.totalRespostas,
    }));
  }
  render();
}

async function carregarMeuStatusNr1() {
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'meu_status' } });
  if (!error && data && !data.error)
    _nr1MeuStatus = { respondidas: data.respondidas || [], aceitas: data.aceitas || [] };
  render();
}

/* ---------- Público elegível (segmentação da campanha) ---------- */
// Quem pode responder uma campanha: todos, ou filtrado por unidade, setor,
// cargo, ou uma lista específica de colaboradores. Calculado sob demanda —
// não precisa guardar a lista, só o critério.
function nr1ColaboradorElegivel(colaborador, publico) {
  if (!colaborador || colaborador.inativo) return false;
  if (!publico || publico.tipo === 'todos') return true;
  if (publico.tipo === 'unidade') return colaborador.unidadeId === publico.valor;
  if (publico.tipo === 'setor') return colaborador.setorId === publico.valor;
  if (publico.tipo === 'cargo') return colaborador.cargoId === publico.valor;
  if (publico.tipo === 'lista') return (publico.valor || []).includes(colaborador.id);
  return true;
}
function nr1ColaboradoresElegiveis(publico) {
  return state.colaboradores.filter((c) => nr1ColaboradorElegivel(c, publico));
}
function nr1DescricaoPublico(publico) {
  if (!publico || publico.tipo === 'todos') return 'Todos os colaboradores';
  if (publico.tipo === 'unidade') return `Unidade: ${nomeSetorNr1(publico.valor)}`;
  if (publico.tipo === 'setor') return `Setor: ${nomeSetorNr1(publico.valor)}`;
  if (publico.tipo === 'cargo') return `Cargo: ${state.cargos.find((c) => c.id === publico.valor)?.nome || '—'}`;
  if (publico.tipo === 'lista') return `Lista específica (${(publico.valor || []).length} pessoas)`;
  return 'Todos os colaboradores';
}

/* ---------- Campanha (criação e listagem) ---------- */
let _nr1NovaCampanhaAberta = false;
let _nr1NovoPublicoTipo = 'todos'; // controla o segundo campo do formulário de nova campanha

function abrirNovaCampanha() {
  _nr1NovaCampanhaAberta = true;
  _nr1NovoPublicoTipo = 'todos';
  render();
}

async function criarCampanhaNr1() {
  const nome = document.getElementById('nr1_camp_nome').value.trim();
  const dataInicio = document.getElementById('nr1_camp_inicio').value;
  const dataFim = document.getElementById('nr1_camp_fim').value;
  const anonimatoMinimo = parseInt(document.getElementById('nr1_camp_anonimato').value, 10) || 5;
  if (!nome || !dataInicio || !dataFim) {
    showToast('Preencha nome, data de início e data de fim.');
    return;
  }
  const publicoTipo = document.getElementById('nr1_camp_publico_tipo')?.value || 'todos';
  let publico = { tipo: 'todos', valor: null };
  if (publicoTipo === 'unidade' || publicoTipo === 'setor' || publicoTipo === 'cargo') {
    publico = { tipo: publicoTipo, valor: document.getElementById('nr1_camp_publico_valor')?.value || null };
  } else if (publicoTipo === 'lista') {
    const marcados = Array.from(document.querySelectorAll('.nr1-lista-colab:checked')).map((el) => el.value);
    publico = { tipo: 'lista', valor: marcados };
  }
  const { data, error } = await sb.functions.invoke('nr1', {
    body: { action: 'campanha_criar', nome, dataInicio, dataFim, anonimatoMinimo, publico },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível criar a campanha.');
    return;
  }
  _nr1NovaCampanhaAberta = false;
  showToast('Campanha criada como rascunho. Publique quando estiver pronta.');
  await carregarCampanhasNr1();
}

async function publicarCampanhaNr1(campanhaId) {
  if (!nr1TemSstNomeado()) {
    showToast('É preciso nomear um responsável técnico (SST) antes de publicar uma campanha.');
    return;
  }
  const { data, error } = await sb.functions.invoke('nr1', {
    body: { action: 'campanha_publicar', campanhaId, dimensoesSnapshot: state.nr1.dimensoes },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível publicar.');
    return;
  }
  showToast('Campanha publicada.');
  await carregarCampanhasNr1();
}

async function encerrarCampanhaNr1(campanhaId) {
  if (!confirm('Encerrar esta campanha? Não será possível receber novas respostas.')) return;
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'campanha_encerrar', campanhaId } });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível encerrar.');
    return;
  }
  await carregarCampanhasNr1();
}

function _nr1StatusPill(status) {
  if (status === 'ativa') return 'pill-alavancar';
  if (status === 'encerrada') return 'pill-neutral';
  return 'pill-desenvolver';
}
function _nr1StatusLabel(status) {
  return status === 'ativa' ? 'Ativa' : status === 'encerrada' ? 'Encerrada' : 'Rascunho';
}

/* ---------- Coleta anônima (todo mundo responde) ---------- */
let _nr1RespondendoCampanhaId = null; // id da campanha com o formulário aberto

function minhaCampanhaJaRespondeu(c) {
  return _nr1MeuStatus.respondidas.includes(c.id);
}

// "Salvar e continuar": guarda o rascunho no navegador da própria pessoa
// (nunca no servidor) — se ela saltar fora e voltar, retoma de onde parou.
// Não afeta o anonimato: é local, some ao enviar, e não sai da máquina dela.
function _nr1ChaveRascunho(campanhaId) {
  return `nr1_rascunho_${campanhaId}_${meuPerfilId}`;
}
function salvarRascunhoNr1(campanhaId) {
  const c = _nr1Campanhas.find((x) => x.id === campanhaId);
  if (!c) return;
  const valores = {};
  (c.dimensoesSnapshot || []).forEach((d) => {
    d.perguntas.forEach((_, i) => {
      const el = document.getElementById(`nr1_resp_${d.id}_${i}`);
      if (el && el.value) valores[`${d.id}_${i}`] = el.value;
    });
  });
  try {
    localStorage.setItem(_nr1ChaveRascunho(campanhaId), JSON.stringify(valores));
  } catch (e) {
    console.error('Falha ao salvar rascunho NR1', e);
  }
}
function carregarRascunhoNr1(campanhaId) {
  try {
    const raw = localStorage.getItem(_nr1ChaveRascunho(campanhaId));
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function limparRascunhoNr1(campanhaId) {
  try {
    localStorage.removeItem(_nr1ChaveRascunho(campanhaId));
  } catch (e) {
    /* ignora */
  }
}

function abrirResponderNr1(campanhaId) {
  _nr1RespondendoCampanhaId = campanhaId;
  render();
}

// Aviso de privacidade + registro de aceite: guarda QUEM aceitou participar
// (não o que respondeu) — é um registro de consentimento no SERVIDOR,
// separado da resposta em si, então não quebra o anonimato (mesmo
// princípio de "quem já respondeu": sabe quem participou, não o que cada
// um disse — e agora nem esse "quem" chega ao navegador de outra pessoa).
function jaAceitouPrivacidadeNr1(c) {
  return _nr1MeuStatus.aceitas.includes(c.id);
}
async function aceitarPrivacidadeNr1(campanhaId) {
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'consentimento_aceitar', campanhaId } });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível registrar o aceite.');
    return;
  }
  if (!_nr1MeuStatus.aceitas.includes(campanhaId)) _nr1MeuStatus.aceitas.push(campanhaId);
  render();
}

async function enviarRespostaNr1(campanhaId) {
  const c = _nr1Campanhas.find((x) => x.id === campanhaId);
  if (!c || c.status !== 'ativa') return;
  if (minhaCampanhaJaRespondeu(c)) return;

  const porDimensao = {};
  let faltaAlguma = false;
  (c.dimensoesSnapshot || []).forEach((d) => {
    porDimensao[d.id] = d.perguntas.map((_, i) => {
      const el = document.getElementById(`nr1_resp_${d.id}_${i}`);
      const v = el ? parseInt(el.value, 10) : NaN;
      if (isNaN(v)) faltaAlguma = true;
      return v;
    });
  });
  if (faltaAlguma) {
    showToast('Responda todas as perguntas antes de enviar.');
    return;
  }

  // Anônimo: a resposta NÃO leva o perfilId — só o setor/unidade da pessoa,
  // pra permitir consolidar por grupo sem identificar quem respondeu. Vai
  // direto pro servidor (Edge Function "nr1"), nunca fica no blob do navegador.
  const colaborador = state.colaboradores.find((x) => x.perfilId === meuPerfilId);
  const { data, error } = await sb.functions.invoke('nr1', {
    body: {
      action: 'responder',
      campanhaId,
      setorId: colaborador?.setorId || null,
      unidadeId: colaborador?.unidadeId || null,
      porDimensao,
    },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível enviar. Tente novamente.');
    return;
  }
  _nr1MeuStatus.respondidas.push(campanhaId);
  limparRascunhoNr1(campanhaId);
  _nr1RespondendoCampanhaId = null;
  showToast('Resposta enviada de forma anônima. Obrigado pela participação!');
  await carregarCampanhasNr1();
}

function renderMinhasPesquisasNr1() {
  const meuColaborador = state.colaboradores.find((c) => c.perfilId === meuPerfilId);
  const ativas = (_nr1Campanhas || []).filter(
    (c) => c.status === 'ativa' && !minhaCampanhaJaRespondeu(c) && nr1ColaboradorElegivel(meuColaborador, c.publico)
  );
  if (!ativas.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--gold);">
      <h3>Minhas pesquisas <small>sua resposta é sempre anônima — ninguém vê o que você respondeu individualmente</small></h3>
      ${ativas
        .map((c) => {
          if (_nr1RespondendoCampanhaId === c.id) {
            if (!jaAceitouPrivacidadeNr1(c)) {
              return `
              <div class="card" style="background:var(--surface-2);margin-top:10px;">
                <h3 style="font-size:14px;">${escaparHtml(c.nome)} — Aviso de privacidade</h3>
                <p class="small-muted">Esta pesquisa avalia <b>condições e organização do trabalho</b> — nunca a sua saúde ou desempenho individual. Sua resposta é <b>anônima</b>: não é guardada com seu nome, e o resultado só é mostrado de forma consolidada por grupo, nunca individualmente. O objetivo é identificar riscos psicossociais no ambiente de trabalho para a empresa poder agir (NR1). Ao continuar, você confirma que entendeu isso e concorda em participar.</p>
                <button class="btn btn-primary" onclick="aceitarPrivacidadeNr1('${c.id}')">Li e aceito participar</button>
                <button class="btn btn-ghost" onclick="_nr1RespondendoCampanhaId=null;render();">Voltar</button>
              </div>`;
            }
            const rascunho = carregarRascunhoNr1(c.id);
            return `
            <div class="card" style="background:var(--surface-2);margin-top:10px;">
              <h3 style="font-size:14px;">${escaparHtml(c.nome)}</h3>
              <p class="small-muted">Para cada afirmação, escolha o quanto ela é verdadeira no seu dia a dia (1 = discordo totalmente, 5 = concordo totalmente). Seu progresso é salvo automaticamente neste aparelho, então você pode continuar depois se precisar sair.</p>
              ${(c.dimensoesSnapshot || [])
                .map(
                  (d) => `
                <div style="margin-top:14px;">
                  <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${escaparHtml(d.nome)}</div>
                  ${d.perguntas
                    .map((p, i) => {
                      const salvo = rascunho[`${d.id}_${i}`] || '';
                      return `
                    <div style="margin-bottom:10px;">
                      <div style="font-size:13px;margin-bottom:4px;">${escaparHtml(p)}</div>
                      <select id="nr1_resp_${d.id}_${i}" style="max-width:280px;" onchange="salvarRascunhoNr1('${c.id}')">
                        <option value="" ${salvo === '' ? 'selected' : ''}>Escolha uma opção</option>
                        <option value="1" ${salvo === '1' ? 'selected' : ''}>1 — Discordo totalmente</option>
                        <option value="2" ${salvo === '2' ? 'selected' : ''}>2 — Discordo</option>
                        <option value="3" ${salvo === '3' ? 'selected' : ''}>3 — Neutro</option>
                        <option value="4" ${salvo === '4' ? 'selected' : ''}>4 — Concordo</option>
                        <option value="5" ${salvo === '5' ? 'selected' : ''}>5 — Concordo totalmente</option>
                      </select>
                    </div>`;
                    })
                    .join('')}
                </div>`
                )
                .join('')}
              <button class="btn btn-primary" style="margin-top:10px;" onclick="enviarRespostaNr1('${c.id}')">Enviar resposta anônima</button>
              <button class="btn btn-ghost" onclick="_nr1RespondendoCampanhaId=null;render();">Salvar rascunho e sair</button>
            </div>`;
          }
          const temRascunho = Object.keys(carregarRascunhoNr1(c.id)).length > 0;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--line);">
            <span>${escaparHtml(c.nome)}${temRascunho ? ' <span class="small-muted">(rascunho salvo)</span>' : ''}</span>
            <button class="btn btn-sm btn-primary" onclick="abrirResponderNr1('${c.id}')">${temRascunho ? 'Continuar' : 'Responder'}</button>
          </div>`;
        })
        .join('')}
    </div>`;
}

/* ---------- Consolidação por grupo (owner/rh) ---------- */
let _nr1CampanhaResultadoAberta = null;

// Registra toda visualização do resultado consolidado — não a resposta, o
// ato de VER o resultado. Exigência de auditoria: quem, quando. O registro
// acontece no SERVIDOR (a cada chamada de "resultado_consolidado"), então
// só busca uma vez ao abrir (usa o cache) — reabrir sem recarregar não
// dispara outra chamada nem outro log.
async function carregarResultadoNr1(campanhaId) {
  _nr1ResultadosCache[campanhaId] = { loading: true };
  render();
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'resultado_consolidado', campanhaId } });
  if (error || data?.error) {
    _nr1ResultadosCache[campanhaId] = { loading: false, erro: (data && data.error) || 'Falha ao carregar.' };
    render();
    return;
  }
  _nr1ResultadosCache[campanhaId] = {
    loading: false,
    anonimatoMinimo: data.anonimatoMinimo,
    dimensoesSnapshot: data.dimensoesSnapshot,
    respostas: (data.respostas || []).map((r) => ({ setorId: r.setor_id, porDimensao: r.por_dimensao })),
  };
  render();
  carregarLogVisualizacoesNr1(campanhaId);
}

async function carregarLogVisualizacoesNr1(campanhaId) {
  const { data, error } = await sb.functions.invoke('nr1', { body: { action: 'log_visualizacoes', campanhaId } });
  if (!error && data && !data.error && _nr1ResultadosCache[campanhaId]) {
    _nr1ResultadosCache[campanhaId].totalVisualizacoes = data.total;
    _nr1ResultadosCache[campanhaId].ultimasVisualizacoes = data.ultimas || [];
    render();
  }
}

function alternarResultadoNr1(campanhaId) {
  const vaiAbrir = _nr1CampanhaResultadoAberta !== campanhaId;
  _nr1CampanhaResultadoAberta = vaiAbrir ? campanhaId : null;
  if (vaiAbrir && !_nr1ResultadosCache[campanhaId]) {
    carregarResultadoNr1(campanhaId);
  } else {
    render();
  }
}

// Exporta um PDF com o resultado consolidado, o inventário de riscos e o
// plano de ação — pro RH baixar e enviar ao profissional de SST por fora
// do sistema (o SST não tem conta/login aqui). Segue o mesmo padrão visual
// dos outros relatórios em PDF do sistema.
async function exportarRelatorioNr1PDF(campanhaId) {
  const c = _nr1Campanhas.find((x) => x.id === campanhaId);
  if (!c) return;
  if (!_nr1ResultadosCache[campanhaId] || _nr1ResultadosCache[campanhaId].loading) {
    showToast('Carregando dados do resultado…');
    await carregarResultadoNr1(campanhaId);
  }
  const cache = _nr1ResultadosCache[campanhaId];
  if (!cache || cache.erro) {
    showToast('Não foi possível carregar o resultado para exportar.');
    return;
  }
  await garantirJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const corPrimaria = hexParaRgb(state.configuracoes?.identidadeVisual?.corPrimaria);

  doc.setFontSize(16);
  doc.text('Relatório NR1 — Riscos Psicossociais', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(state.empresa?.nomeFantasia || '', 14, 24);
  doc.setTextColor(0);
  if (typeof desenharLogoNoPDF === 'function') desenharLogoNoPDF(doc, 165, 8, 32, 18);

  doc.setFontSize(12);
  doc.text(c.nome, 14, 34);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Período: ${new Date(`${c.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${c.dataFim}T00:00:00`).toLocaleDateString('pt-BR')}    Mínimo de anonimato: ${cache.anonimatoMinimo} respostas por grupo`,
    14,
    40
  );
  const sst = state.nr1.sst;
  doc.text(
    `Responsável técnico (SST): ${sst?.nome ? sst.nome : 'NÃO DEFINIDO'}${sst?.contato ? ' · ' + sst.contato : ''}`,
    14,
    45
  );
  doc.setTextColor(0);

  const dimensoes = cache.dimensoesSnapshot || [];
  const respostas = cache.respostas || [];
  const totalOk = respostas.length >= cache.anonimatoMinimo;
  const geral = totalOk ? _nr1MediasPorDimensao(respostas, dimensoes) : null;

  let y = 55;
  doc.setFontSize(11);
  doc.text(`Resultado consolidado — empresa toda (${respostas.length} respostas)`, 14, y);
  y += 4;
  if (totalOk) {
    doc.autoTable({
      startY: y,
      head: [['Dimensão', 'Média (0-5)', 'Nível']],
      body: dimensoes.map((d) => {
        const v = geral[d.id];
        return [d.nome, v !== null ? v.toFixed(1) : '—', _nr1CorMedia(v).label];
      }),
      styles: { fontSize: 9 },
      headStyles: { fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.text('Dados insuficientes para exibir (mínimo de anonimato não atingido).', 14, y + 4);
    y += 14;
  }

  // Resultado por grupo, incluindo grupos pequenos agregados hierarquicamente
  // (mesma regra de anonimato usada na tela).
  const porSetor = {};
  respostas.forEach((r) => {
    const key = r.setorId || '__sem_setor__';
    (porSetor[key] = porSetor[key] || []).push(r);
  });
  const setoresOk = [];
  const pequenas = [];
  Object.entries(porSetor).forEach(([id, resp]) => {
    if (resp.length >= cache.anonimatoMinimo) setoresOk.push([id, resp]);
    else pequenas.push(...resp);
  });
  const agregados = pequenas.length ? _nr1AgregarGruposPequenos(pequenas, cache.anonimatoMinimo) : [];
  const linhasGrupo = [];
  setoresOk.forEach(([id, resp]) => {
    const nome = id === '__sem_setor__' ? 'Sem setor definido' : nomeSetorNr1(id);
    const medias = _nr1MediasPorDimensao(resp, dimensoes);
    dimensoes.forEach((d) => {
      const v = medias[d.id];
      linhasGrupo.push([nome, d.nome, v !== null ? v.toFixed(1) : '—', _nr1CorMedia(v).label]);
    });
  });
  agregados
    .filter((a) => a.atingiuMinimo)
    .forEach((g) => {
      const nome = _nr1NomeGrupoAgregado(g.key);
      const medias = _nr1MediasPorDimensao(g.respostas, dimensoes);
      dimensoes.forEach((d) => {
        const v = medias[d.id];
        linhasGrupo.push([nome, d.nome, v !== null ? v.toFixed(1) : '—', _nr1CorMedia(v).label]);
      });
    });
  if (linhasGrupo.length) {
    doc.setFontSize(11);
    doc.text('Resultado por grupo', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [['Grupo', 'Dimensão', 'Média', 'Nível']],
      body: linhasGrupo,
      styles: { fontSize: 8 },
      headStyles: { fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Inventário de riscos (todos os registrados — o modelo atual não separa
  // riscos por campanha).
  if (state.nr1.riscos.length) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text('Inventário de riscos', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [['Descrição', 'Grupo', 'Prob.', 'Sev.', 'Nível', 'Decisão']],
      body: state.nr1.riscos.map((r) => {
        const niv = nivelRiscoNr1(r.probabilidade, r.severidade);
        return [r.descricao, r.grupoAfetado, r.probabilidade, r.severidade, niv.nivel, r.decisao];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Plano de ação.
  if (state.nr1.acoes.length) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text('Plano de ação', 14, y);
    y += 4;
    doc.autoTable({
      startY: y,
      head: [['Ação', 'Responsável', 'Prazo', 'Status', 'Eficácia']],
      body: state.nr1.acoes.map((a) => {
        const resp = (_perfisEmpresa || []).find((p) => p.id === a.responsavelId);
        const st = _nr1AcaoStatusExibicao(a);
        const efic = a.eficacia
          ? a.eficacia.resultado === 'melhorou'
            ? 'Eficaz'
            : a.eficacia.resultado === 'parcial'
              ? 'Parcial'
              : 'Não eficaz'
          : 'Pendente';
        return [
          a.titulo,
          resp ? resp.nome : '—',
          a.prazo ? new Date(`${a.prazo}T00:00:00`).toLocaleDateString('pt-BR') : '—',
          st.label,
          efic,
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: corPrimaria },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    `Gerado pelo INETRIS em ${new Date().toLocaleString('pt-BR')}. Este relatório organiza dados coletados; a classificação de risco e a validação técnica são de responsabilidade do profissional de SST nomeado.`,
    14,
    285,
    { maxWidth: 180 }
  );

  doc.save(`relatorio-nr1-${c.nome.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`);
}

function nomeSetorNr1(setorId) {
  if (!setorId) return 'Sem setor definido';
  return state.estrutura.find((n) => n.id === setorId)?.nome || 'Sem setor definido';
}

// Média de cada dimensão para um conjunto de respostas.
function _nr1MediasPorDimensao(respostas, dimensoes) {
  const medias = {};
  dimensoes.forEach((d) => {
    let soma = 0;
    let qtd = 0;
    respostas.forEach((r) => {
      (r.porDimensao?.[d.id] || []).forEach((v) => {
        soma += v;
        qtd++;
      });
    });
    medias[d.id] = qtd ? soma / qtd : null;
  });
  return medias;
}

function _nr1CorMedia(v) {
  if (v === null) return { classe: 'pill-neutral', label: '—' };
  if (v < 2.5) return { classe: 'pill-iniciar', label: v.toFixed(1) };
  if (v < 3.5) return { classe: 'pill-desenvolver', label: v.toFixed(1) };
  return { classe: 'pill-alavancar', label: v.toFixed(1) };
}

// Liga o resultado da pesquisa à matriz de risco: pré-preenche o formulário
// do inventário com a dimensão/grupo já identificados. Probabilidade e
// severidade continuam sendo definidas por julgamento humano — a pesquisa
// só indica ONDE olhar, não decide o nível do risco.
let _nr1PrefilRisco = null;

function registrarRiscoAPartirDoResultado(dimensaoId, dimensaoNome, grupoNome, media) {
  _nr1PrefilRisco = {
    descricao: `${dimensaoNome} — resultado da pesquisa abaixo do esperado em "${grupoNome}" (média ${media.toFixed(1)} de 5).`,
    dimensaoId,
    grupoNome,
    probabilidadeSugerida: media < 2 ? 5 : media < 2.5 ? 4 : 3,
  };
  _nr1NovoRiscoAberto = true;
  render();
  setTimeout(() => {
    const el = document.querySelector('.card');
    el?.scrollIntoView?.({ behavior: 'smooth' });
  }, 50);
}

function _nr1BotaoRegistrarRisco(dimensaoId, dimensaoNome, grupoNome, media) {
  if (media === null || media >= 3.5) return ''; // só sugere quando o resultado indica atenção
  return `<button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="registrarRiscoAPartirDoResultado('${dimensaoId}','${escaparParaOnclick(dimensaoNome)}','${escaparParaOnclick(grupoNome)}',${media})">+ Registrar risco</button>`;
}

// Agregação hierárquica: setores com menos respostas que o mínimo não ficam
// simplesmente ocultos — sobem pro nível de cima (o pai na Estrutura) e se
// juntam com outros setores pequenos daquele mesmo pai. Se a soma atingir o
// mínimo, mostra agregado nesse nível; se não, sobe mais um nível, até
// "toda a empresa" como último recurso. Protege o anonimato sem jogar fora
// o dado — é o que o documento pede em vez de só esconder.
function _nr1AgregarGruposPequenos(respostasPequenas, min) {
  let buckets = {};
  respostasPequenas.forEach((r) => {
    const setor = r.setorId ? state.estrutura.find((n) => n.id === r.setorId) : null;
    const key = setor?.paiId || '__raiz__';
    (buckets[key] = buckets[key] || []).push(r);
  });

  const resultados = [];
  let pendentes = buckets;
  let voltas = 0; // segurança contra ciclo malformado na estrutura
  while (Object.keys(pendentes).length && voltas < 10) {
    voltas++;
    const proximo = {};
    Object.entries(pendentes).forEach(([key, resp]) => {
      if (resp.length >= min || key === '__raiz__') {
        resultados.push({ key, respostas: resp, atingiuMinimo: resp.length >= min });
      } else {
        const node = state.estrutura.find((n) => n.id === key);
        const chavePai = node?.paiId || '__raiz__';
        (proximo[chavePai] = proximo[chavePai] || []).push(...resp);
      }
    });
    pendentes = proximo;
  }
  return resultados;
}

function _nr1NomeGrupoAgregado(key) {
  if (key === '__raiz__') return 'Outros grupos pequenos (agregado — toda a empresa)';
  const node = state.estrutura.find((n) => n.id === key);
  return node ? `${node.nome} (agregado dos setores menores)` : 'Agregado';
}

function renderResultadoCampanhaNr1(c) {
  const cache = _nr1ResultadosCache[c.id];
  if (!cache || cache.loading) {
    return `<div class="card" style="background:var(--surface-2);margin-top:12px;"><div class="empty">Carregando resultado do servidor…</div></div>`;
  }
  if (cache.erro) {
    return `<div class="card" style="background:var(--surface-2);margin-top:12px;"><div class="empty">${escaparHtml(cache.erro)}</div></div>`;
  }
  const dimensoes = cache.dimensoesSnapshot || [];
  const respostas = cache.respostas || [];
  const min = cache.anonimatoMinimo || 5;

  // Agrupa por setor.
  const porSetor = {};
  respostas.forEach((r) => {
    const key = r.setorId || '__sem_setor__';
    (porSetor[key] = porSetor[key] || []).push(r);
  });

  const totalOk = respostas.length >= min;
  const geral = totalOk ? _nr1MediasPorDimensao(respostas, dimensoes) : null;

  // Separa setores que atingem o mínimo sozinhos dos que precisam agregar.
  const setoresOk = [];
  const respostasPequenas = [];
  Object.entries(porSetor).forEach(([setorId, resp]) => {
    if (resp.length >= min) setoresOk.push([setorId, resp]);
    else respostasPequenas.push(...resp);
  });
  const gruposAgregados = respostasPequenas.length ? _nr1AgregarGruposPequenos(respostasPequenas, min) : [];

  return `
    <div class="card" style="background:var(--surface-2);margin-top:12px;">
      <h3 style="font-size:14px;">Resultado — ${escaparHtml(c.nome)} <small>${respostas.length} resposta(s) recebida(s)</small></h3>

      <div style="margin-top:10px;">
        <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:6px;">Empresa toda</div>
        ${
          !totalOk
            ? `<div class="empty">Dados insuficientes (mínimo de ${min} respostas para exibir).</div>`
            : `<table><thead><tr><th>Dimensão</th><th>Média</th><th></th></tr></thead><tbody>
              ${dimensoes
                .map((d) => {
                  const cor = _nr1CorMedia(geral[d.id]);
                  return `<tr><td>${escaparHtml(d.nome)}</td><td><span class="pill ${cor.classe}">${cor.label}</span></td><td>${geral[d.id] !== null ? _nr1BotaoRegistrarRisco(d.id, d.nome, 'Toda a empresa', geral[d.id]) : ''}</td></tr>`;
                })
                .join('')}
            </tbody></table>`
        }
      </div>

      <div style="margin-top:16px;">
        <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:6px;">Por setor <small>(com o mínimo de ${min} respostas próprio)</small></div>
        ${
          setoresOk.length
            ? setoresOk
                .map(([setorId, resp]) => {
                  const nome = setorId === '__sem_setor__' ? 'Sem setor definido' : nomeSetorNr1(setorId);
                  const medias = _nr1MediasPorDimensao(resp, dimensoes);
                  return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
                <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${escaparHtml(nome)} <span class="small-muted">(${resp.length} respostas)</span></div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  ${dimensoes
                    .map((d) => {
                      const cor = _nr1CorMedia(medias[d.id]);
                      return `<span class="pill ${cor.classe}" title="${escaparHtml(d.nome)}" style="font-size:11px;">${escaparHtml(d.nome.split(' ')[0])}: ${cor.label}</span>${medias[d.id] !== null ? _nr1BotaoRegistrarRisco(d.id, d.nome, nome, medias[d.id]) : ''}`;
                    })
                    .join('')}
                </div>
              </div>`;
                })
                .join('')
            : '<div class="small-muted">Nenhum setor atingiu o mínimo por conta própria.</div>'
        }
      </div>

      ${
        gruposAgregados.length
          ? `<div style="margin-top:16px;">
        <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:6px;">Grupos pequenos, agregados <small>setores com menos de ${min} respostas foram somados ao nível de cima em vez de ocultados</small></div>
        ${gruposAgregados
          .map((g) => {
            const nome = _nr1NomeGrupoAgregado(g.key);
            if (!g.atingiuMinimo) {
              return `<div class="small-muted" style="padding:4px 0;">${escaparHtml(nome)}: mesmo agregado, ainda são só ${g.respostas.length} resposta(s) — dados insuficientes.</div>`;
            }
            const medias = _nr1MediasPorDimensao(g.respostas, dimensoes);
            return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${escaparHtml(nome)} <span class="small-muted">(${g.respostas.length} respostas)</span></div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                ${dimensoes
                  .map((d) => {
                    const cor = _nr1CorMedia(medias[d.id]);
                    return `<span class="pill ${cor.classe}" title="${escaparHtml(d.nome)}" style="font-size:11px;">${escaparHtml(d.nome.split(' ')[0])}: ${cor.label}</span>${medias[d.id] !== null ? _nr1BotaoRegistrarRisco(d.id, d.nome, nome, medias[d.id]) : ''}`;
                  })
                  .join('')}
              </div>
            </div>`;
          })
          .join('')}
      </div>`
          : ''
      }

      <div style="margin-top:16px;padding-top:8px;border-top:1px solid var(--line);">
        <div class="small-muted" style="font-size:11px;">🔒 Este resultado foi visualizado ${cache.totalVisualizacoes ?? '…'} vez(es)${
          (cache.ultimasVisualizacoes || []).length
            ? '. Últimas visualizações: ' +
              cache.ultimasVisualizacoes
                .map((l) => `${escaparHtml(l.nome)} em ${new Date(l.em).toLocaleString('pt-BR')}`)
                .join(' · ')
            : '.'
        }</div>
      </div>
    </div>`;
}

/* =========================================================
   FASE 3 — Registro de risco e plano de ação
   ========================================================= */

// Matriz de risco 5x5 (probabilidade × severidade) — o resultado da pesquisa
// (a nota média) NÃO é o risco em si; é insumo pra alguém (SST/RH) avaliar
// probabilidade e severidade com julgamento humano, como a norma exige.
function nivelRiscoNr1(probabilidade, severidade) {
  const score = probabilidade * severidade;
  if (score <= 4) return { nivel: 'Baixo', classe: 'pill-alavancar', score };
  if (score <= 9) return { nivel: 'Médio', classe: 'pill-desenvolver', score };
  if (score <= 15) return { nivel: 'Alto', classe: 'pill-iniciar', score };
  return { nivel: 'Crítico', classe: 'pill-iniciar', score };
}

let _nr1NovoRiscoAberto = false;
let _nr1RiscoAcaoAberta = null; // id do risco com o formulário de nova ação aberto

function abrirNovoRisco() {
  _nr1NovoRiscoAberto = true;
  render();
}

function criarRiscoNr1() {
  const descricao = document.getElementById('nr1_risco_descricao').value.trim();
  const dimensaoId = document.getElementById('nr1_risco_dimensao').value;
  const grupoAfetado = document.getElementById('nr1_risco_grupo').value;
  const probabilidade = parseInt(document.getElementById('nr1_risco_prob').value, 10);
  const severidade = parseInt(document.getElementById('nr1_risco_sev').value, 10);
  const decisao = document.getElementById('nr1_risco_decisao').value;
  if (!descricao || !probabilidade || !severidade) {
    showToast('Descreva o risco e defina probabilidade e severidade.');
    return;
  }
  const { nivel } = nivelRiscoNr1(probabilidade, severidade);
  state.nr1.riscos.push({
    id: uid(),
    descricao,
    dimensaoId: dimensaoId || null,
    grupoAfetado: grupoAfetado || 'Toda a empresa',
    probabilidade,
    severidade,
    nivel,
    decisao,
    ...novoCarimbo(),
  });
  _nr1NovoRiscoAberto = false;
  _nr1PrefilRisco = null;
  showToast('Risco registrado no inventário.');
  render();
}

function excluirRiscoNr1(riscoId) {
  if (!confirm('Remover este risco e suas ações vinculadas do inventário?')) return;
  state.nr1.riscos = state.nr1.riscos.filter((r) => r.id !== riscoId);
  state.nr1.acoes = state.nr1.acoes.filter((a) => a.riscoId !== riscoId);
  render();
}

function abrirNovaAcao(riscoId) {
  _nr1RiscoAcaoAberta = riscoId;
  render();
}

function criarAcaoNr1(riscoId) {
  const titulo = document.getElementById(`nr1_acao_titulo_${riscoId}`).value.trim();
  const tipo = document.getElementById(`nr1_acao_tipo_${riscoId}`).value;
  const responsavelId = document.getElementById(`nr1_acao_resp_${riscoId}`).value || null;
  const prazo = document.getElementById(`nr1_acao_prazo_${riscoId}`).value || null;
  if (!titulo) {
    showToast('Descreva a ação.');
    return;
  }
  state.nr1.acoes.push({
    id: uid(),
    riscoId,
    titulo,
    tipo,
    responsavelId,
    prazo,
    status: 'planejada', // planejada | em_andamento | concluida | cancelada
    evidencia: '',
    eficacia: null, // { dataVerificacao, resultado, parecer, precisaNovaAcao }
    ...novoCarimbo(),
  });
  _nr1RiscoAcaoAberta = null;
  showToast('Ação criada.');
  render();
}

function _nr1AcaoStatusExibicao(a) {
  if (a.status === 'concluida') return { label: 'Concluída', classe: 'pill-alavancar' };
  if (a.status === 'cancelada') return { label: 'Cancelada', classe: 'pill-neutral' };
  if (a.prazo && a.prazo < hojeLocalISO()) return { label: 'Atrasada', classe: 'pill-iniciar' };
  if (a.status === 'em_andamento') return { label: 'Em andamento', classe: 'pill-desenvolver' };
  return { label: 'Planejada', classe: 'pill-neutral' };
}

function avancarStatusAcao(acaoId, novoStatus) {
  const a = state.nr1.acoes.find((x) => x.id === acaoId);
  if (!a) return;
  a.status = novoStatus;
  render();
}

function verificarEficaciaAcao(acaoId) {
  const resultado = prompt('A ação foi eficaz? Digite: melhorou, parcial ou nao_melhorou');
  if (!resultado) return;
  const valido = ['melhorou', 'parcial', 'nao_melhorou'].includes(resultado.trim());
  if (!valido) {
    showToast('Digite exatamente: melhorou, parcial ou nao_melhorou.');
    return;
  }
  const parecer = prompt('Parecer (breve observação sobre a verificação):') || '';
  const a = state.nr1.acoes.find((x) => x.id === acaoId);
  if (!a) return;
  a.eficacia = {
    dataVerificacao: new Date().toISOString(),
    resultado: resultado.trim(),
    parecer,
    precisaNovaAcao: resultado.trim() !== 'melhorou',
  };
  showToast('Eficácia registrada.' + (a.eficacia.precisaNovaAcao ? ' O risco continua precisando de atenção.' : ''));
  render();
}

function renderInventarioRiscosNr1() {
  const riscos = (state.nr1.riscos || [])
    .slice()
    .sort(
      (a, b) => nivelRiscoNr1(b.probabilidade, b.severidade).score - nivelRiscoNr1(a.probabilidade, a.severidade).score
    );
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Inventário de riscos <small>probabilidade × severidade define o nível — julgamento do responsável técnico</small></h3>
        <button class="btn btn-primary btn-sm" onclick="abrirNovoRisco()">Registrar risco</button>
      </div>
      ${
        _nr1NovoRiscoAberto
          ? `
        <div class="card" style="background:var(--surface-2);margin-top:12px;">
          <h3 style="font-size:14px;">Novo risco</h3>
          ${_nr1PrefilRisco ? '<div class="notice info">Preenchido a partir do resultado da pesquisa — confirme e defina probabilidade e severidade com seu julgamento técnico.</div>' : ''}
          <div class="field"><label>Descrição do perigo/fator</label><textarea id="nr1_risco_descricao" placeholder="Ex: Sobrecarga de trabalho nos horários de pico">${escaparHtml(_nr1PrefilRisco?.descricao || '')}</textarea></div>
          <div class="grid3">
            <div class="field"><label>Dimensão relacionada</label>
              <select id="nr1_risco_dimensao"><option value="">—</option>${state.nr1.dimensoes.map((d) => `<option value="${d.id}" ${_nr1PrefilRisco?.dimensaoId === d.id ? 'selected' : ''}>${escaparHtml(d.nome)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Grupo afetado</label>
              <select id="nr1_risco_grupo">
                <option value="Toda a empresa" ${_nr1PrefilRisco?.grupoNome === 'Toda a empresa' ? 'selected' : ''}>Toda a empresa</option>
                ${state.estrutura
                  .filter((n) => ['setor', 'equipe', 'departamento', 'unidade'].includes(n.tipo))
                  .map(
                    (n) =>
                      `<option value="${escaparHtml(n.nome)}" ${_nr1PrefilRisco?.grupoNome === n.nome ? 'selected' : ''}>${escaparHtml(n.nome)}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="field"><label>Decisão</label>
              <select id="nr1_risco_decisao">
                <option value="reduzir">Reduzir</option>
                <option value="eliminar">Eliminar</option>
                <option value="controlar">Controlar</option>
                <option value="investigar">Investigar</option>
                <option value="aceitar">Aceitar (dentro do critério)</option>
              </select>
            </div>
          </div>
          <div class="grid2">
            <div class="field"><label>Probabilidade <small>(1=rara, 5=quase certa)</small></label>
              <select id="nr1_risco_prob">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(_nr1PrefilRisco?.probabilidadeSugerida || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Severidade <small>(1=leve, 5=gravíssima)</small></label>
              <select id="nr1_risco_sev"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select>
            </div>
          </div>
          <button class="btn btn-primary" onclick="criarRiscoNr1()">Registrar</button>
          <button class="btn btn-ghost" onclick="_nr1NovoRiscoAberto=false;_nr1PrefilRisco=null;render();">Cancelar</button>
        </div>`
          : ''
      }
      ${
        riscos.length
          ? riscos
              .map((r) => {
                const { nivel, classe } = nivelRiscoNr1(r.probabilidade, r.severidade);
                const acoesDoRisco = (state.nr1.acoes || []).filter((a) => a.riscoId === r.id);
                return `
              <div class="card" style="background:var(--surface-2);margin-top:12px;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;">
                  <div>
                    <div style="font-weight:600;">${escaparHtml(r.descricao)}</div>
                    <div class="small-muted" style="margin-top:2px;">${escaparHtml(r.grupoAfetado)}${r.dimensaoId ? ' · ' + escaparHtml(state.nr1.dimensoes.find((d) => d.id === r.dimensaoId)?.nome || '') : ''} · Decisão: ${escaparHtml(r.decisao)}</div>
                  </div>
                  <div style="text-align:right;white-space:nowrap;">
                    <span class="pill ${classe}">${nivel} (${r.probabilidade}×${r.severidade})</span><br>
                    <button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="excluirRiscoNr1('${r.id}')">Remover</button>
                  </div>
                </div>

                <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div class="small-muted" style="text-transform:uppercase;letter-spacing:.06em;font-size:11px;">Plano de ação</div>
                    <button class="btn btn-ghost btn-sm" onclick="abrirNovaAcao('${r.id}')">+ Ação</button>
                  </div>
                  ${
                    _nr1RiscoAcaoAberta === r.id
                      ? `
                    <div style="margin-top:8px;">
                      <div class="field"><label>Título da ação</label><input id="nr1_acao_titulo_${r.id}" type="text" placeholder="Ex: Contratar reforço para o horário de pico"></div>
                      <div class="grid3">
                        <div class="field"><label>Tipo</label>
                          <select id="nr1_acao_tipo_${r.id}">
                            <option value="eliminacao">Eliminação</option>
                            <option value="reducao">Redução</option>
                            <option value="controle">Controle</option>
                            <option value="comunicacao">Comunicação</option>
                            <option value="capacitacao">Capacitação</option>
                            <option value="investigacao">Investigação</option>
                            <option value="monitoramento">Monitoramento</option>
                          </select>
                        </div>
                        <div class="field"><label>Responsável</label>
                          <select id="nr1_acao_resp_${r.id}"><option value="">—</option>${(_perfisEmpresa || []).map((p) => `<option value="${p.id}">${escaparHtml(p.nome)}</option>`).join('')}</select>
                        </div>
                        <div class="field"><label>Prazo</label><input id="nr1_acao_prazo_${r.id}" type="date"></div>
                      </div>
                      <button class="btn btn-primary btn-sm" onclick="criarAcaoNr1('${r.id}')">Salvar ação</button>
                      <button class="btn btn-ghost btn-sm" onclick="_nr1RiscoAcaoAberta=null;render();">Cancelar</button>
                    </div>`
                      : ''
                  }
                  ${
                    acoesDoRisco.length
                      ? `<table style="margin-top:8px;"><thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Eficácia</th><th></th></tr></thead><tbody>
                      ${acoesDoRisco
                        .map((a) => {
                          const st = _nr1AcaoStatusExibicao(a);
                          const resp = (_perfisEmpresa || []).find((p) => p.id === a.responsavelId);
                          return `<tr>
                          <td>${escaparHtml(a.titulo)}</td>
                          <td class="small-muted">${resp ? escaparHtml(resp.nome) : '—'}</td>
                          <td class="small-muted">${a.prazo ? new Date(`${a.prazo}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                          <td><span class="pill ${st.classe}">${st.label}</span></td>
                          <td>${
                            a.eficacia
                              ? `<span class="pill ${a.eficacia.resultado === 'melhorou' ? 'pill-alavancar' : a.eficacia.resultado === 'parcial' ? 'pill-desenvolver' : 'pill-iniciar'}">${a.eficacia.resultado === 'melhorou' ? 'Eficaz' : a.eficacia.resultado === 'parcial' ? 'Parcial' : 'Não eficaz'}</span>`
                              : '<span class="small-muted">Pendente</span>'
                          }</td>
                          <td style="white-space:nowrap;">
                            ${a.status !== 'concluida' && a.status !== 'cancelada' ? `<button class="btn btn-ghost btn-sm" onclick="avancarStatusAcao('${a.id}','em_andamento')">Em andamento</button><button class="btn btn-ghost btn-sm" onclick="avancarStatusAcao('${a.id}','concluida')">Concluir</button>` : ''}
                            ${a.status === 'concluida' && !a.eficacia ? `<button class="btn btn-ghost btn-sm" onclick="verificarEficaciaAcao('${a.id}')">Verificar eficácia</button>` : ''}
                          </td>
                        </tr>`;
                        })
                        .join('')}
                    </tbody></table>`
                      : '<div class="small-muted" style="margin-top:6px;">Nenhuma ação cadastrada.</div>'
                  }
                </div>
              </div>`;
              })
              .join('')
          : '<div class="empty" style="margin-top:10px;">Nenhum risco registrado ainda. Registre a partir dos resultados das campanhas.</div>'
      }
    </div>`;
}

/* =========================================================
   FASE 4 — Painel executivo
   ========================================================= */
function renderPainelExecutivoNr1() {
  const riscos = state.nr1.riscos || [];
  const acoes = state.nr1.acoes || [];
  const porNivel = { Baixo: 0, Médio: 0, Alto: 0, Crítico: 0 };
  riscos.forEach((r) => {
    const { nivel } = nivelRiscoNr1(r.probabilidade, r.severidade);
    porNivel[nivel] = (porNivel[nivel] || 0) + 1;
  });
  const hoje = hojeLocalISO();
  const acoesAtrasadas = acoes.filter(
    (a) => a.status !== 'concluida' && a.status !== 'cancelada' && a.prazo && a.prazo < hoje
  ).length;
  const acoesPendentesEficacia = acoes.filter((a) => a.status === 'concluida' && !a.eficacia).length;

  const campanhasPublicadas = (_nr1Campanhas || []).filter((c) => c.status !== 'rascunho');
  const adesaoMedia = campanhasPublicadas.length
    ? Math.round(
        (campanhasPublicadas.reduce(
          (soma, c) => soma + (c.totalRespostas || 0) / (nr1ColaboradoresElegiveis(c.publico).length || 1),
          0
        ) /
          campanhasPublicadas.length) *
          100
      )
    : null;

  return `
    <div class="card">
      <h3>Painel executivo</h3>
      <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);">
        <div class="kpi-card-inetris" style="flex-direction:column;">
          <div class="kpi-card-label">Riscos baixos</div>
          <div class="kpi-card-valor" style="color:var(--alavancar);">${porNivel.Baixo}</div>
        </div>
        <div class="kpi-card-inetris" style="flex-direction:column;">
          <div class="kpi-card-label">Riscos médios</div>
          <div class="kpi-card-valor" style="color:var(--desenvolver);">${porNivel.Médio}</div>
        </div>
        <div class="kpi-card-inetris" style="flex-direction:column;">
          <div class="kpi-card-label">Riscos altos/críticos</div>
          <div class="kpi-card-valor" style="color:var(--iniciar);">${porNivel.Alto + porNivel.Crítico}</div>
        </div>
        <div class="kpi-card-inetris" style="flex-direction:column;">
          <div class="kpi-card-label">Ações atrasadas</div>
          <div class="kpi-card-valor" style="color:${acoesAtrasadas ? 'var(--iniciar)' : 'var(--alavancar)'};">${acoesAtrasadas}</div>
        </div>
        <div class="kpi-card-inetris" style="flex-direction:column;">
          <div class="kpi-card-label">Adesão média</div>
          <div class="kpi-card-valor">${adesaoMedia === null ? '—' : adesaoMedia + '%'}</div>
        </div>
      </div>
      ${acoesPendentesEficacia ? `<div class="notice info" style="margin-top:10px;">${acoesPendentesEficacia} ação(ões) concluída(s) aguardando verificação de eficácia.</div>` : ''}
    </div>`;
}

function pageNr1() {
  garantirDimensoesNr1();
  if (!_nr1JaCarregouCampanhas) {
    _nr1JaCarregouCampanhas = true;
    carregarCampanhasNr1();
    carregarMeuStatusNr1();
  }
  const temSst = nr1TemSstNomeado();
  const souGestor = ['owner', 'rh'].includes(meuPapelReal);

  return `
    <div class="page-head">
      <div class="eyebrow">Segurança e saúde no trabalho</div>
      <h1>NR1 — Riscos Psicossociais</h1>
      <p class="page-desc">Avalia as condições e a organização do trabalho — nunca diagnostica ou classifica uma pessoa. As respostas das campanhas são sempre anônimas.</p>
      ${souGestor ? '<div class="notice info" style="margin-top:10px;">⚠️ Ferramenta pronta para uso interno/testes. O conteúdo das perguntas e as regras de anonimato ainda precisam de validação por um profissional de SST antes de publicar uma campanha com um cliente real.</div>' : ''}
    </div>

    ${renderMinhasPesquisasNr1()}

    ${
      !souGestor
        ? ''
        : `
    <div class="card">
      <h3>Responsável técnico (SST) <small>obrigatório para publicar qualquer campanha</small></h3>
      ${
        temSst
          ? `<div class="notice info">✅ <b>${escaparHtml(state.nr1.sst.nome)}</b>${state.nr1.sst.contato ? ` · ${escaparHtml(state.nr1.sst.contato)}` : ''}</div>
         <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="state.nr1.sst=null;render();">Remover / trocar responsável</button>`
          : `<div class="notice info">⚠️ Sem responsável técnico nomeado — a publicação de campanhas está bloqueada.</div>
         <div class="grid2" style="margin-top:10px;">
           <div class="field"><label>Nome</label><input id="nr1_sst_nome" type="text" placeholder="Nome do profissional/serviço de SST"></div>
           <div class="field"><label>Contato</label><input id="nr1_sst_contato" type="text" placeholder="E-mail ou telefone"></div>
         </div>
         <button class="btn btn-primary" onclick="salvarSst()">Definir responsável técnico</button>`
      }
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Campanhas</h3>
        <button class="btn btn-primary btn-sm" onclick="abrirNovaCampanha()">Nova campanha</button>
      </div>
      ${
        _nr1NovaCampanhaAberta
          ? `
        <div class="card" style="background:var(--surface-2);margin-top:12px;">
          <h3 style="font-size:14px;">Nova campanha</h3>
          <div class="field"><label>Nome</label><input id="nr1_camp_nome" type="text" placeholder="Ex: Avaliação de riscos psicossociais — 2º semestre"></div>
          <div class="grid3">
            <div class="field"><label>Início</label><input id="nr1_camp_inicio" type="date"></div>
            <div class="field"><label>Fim</label><input id="nr1_camp_fim" type="date"></div>
            <div class="field"><label>Mínimo de respondentes por grupo <small>(anonimato)</small></label><input id="nr1_camp_anonimato" type="number" min="2" value="5"></div>
          </div>
          <div class="grid2">
            <div class="field"><label>Público</label>
              <select id="nr1_camp_publico_tipo" onchange="_nr1NovoPublicoTipo=this.value;render();">
                <option value="todos" ${_nr1NovoPublicoTipo === 'todos' ? 'selected' : ''}>Todos os colaboradores</option>
                <option value="unidade" ${_nr1NovoPublicoTipo === 'unidade' ? 'selected' : ''}>Uma unidade</option>
                <option value="setor" ${_nr1NovoPublicoTipo === 'setor' ? 'selected' : ''}>Um setor</option>
                <option value="cargo" ${_nr1NovoPublicoTipo === 'cargo' ? 'selected' : ''}>Um cargo</option>
                <option value="lista" ${_nr1NovoPublicoTipo === 'lista' ? 'selected' : ''}>Lista específica de pessoas</option>
              </select>
            </div>
            ${
              _nr1NovoPublicoTipo === 'unidade' || _nr1NovoPublicoTipo === 'setor'
                ? `<div class="field"><label>${_nr1NovoPublicoTipo === 'unidade' ? 'Unidade' : 'Setor'}</label>
                <select id="nr1_camp_publico_valor" onchange="render()">
                  ${state.estrutura
                    .filter((n) =>
                      _nr1NovoPublicoTipo === 'unidade'
                        ? n.tipo === 'unidade'
                        : ['setor', 'equipe', 'departamento'].includes(n.tipo)
                    )
                    .map((n) => `<option value="${n.id}">${escaparHtml(n.nome)}</option>`)
                    .join('')}
                </select>
              </div>`
                : _nr1NovoPublicoTipo === 'cargo'
                  ? `<div class="field"><label>Cargo</label>
                <select id="nr1_camp_publico_valor" onchange="render()">
                  ${state.cargos.map((c) => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join('')}
                </select>
              </div>`
                  : ''
            }
          </div>
          ${
            _nr1NovoPublicoTipo === 'lista'
              ? `<div class="field"><label>Selecione as pessoas</label>
              <div style="max-height:160px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:8px;">
                ${state.colaboradores
                  .filter((c) => !c.inativo)
                  .map(
                    (c) =>
                      `<label style="display:block;font-size:13px;padding:2px 0;"><input type="checkbox" class="nr1-lista-colab" value="${c.id}"> ${escaparHtml(c.nome)}</label>`
                  )
                  .join('')}
              </div>
            </div>`
              : ''
          }
          <div class="small-muted" style="margin-top:4px;">
            ${(() => {
              let publicoPreview = { tipo: 'todos', valor: null };
              if (_nr1NovoPublicoTipo !== 'todos' && _nr1NovoPublicoTipo !== 'lista') {
                publicoPreview = {
                  tipo: _nr1NovoPublicoTipo,
                  valor: document.getElementById('nr1_camp_publico_valor')?.value || null,
                };
              }
              const qtd =
                _nr1NovoPublicoTipo === 'lista'
                  ? document.querySelectorAll('.nr1-lista-colab:checked').length
                  : nr1ColaboradoresElegiveis(publicoPreview).length;
              return `👥 ${qtd} colaborador(es) elegível(is) para responder.`;
            })()}
          </div>
          <button class="btn btn-primary" style="margin-top:8px;" onclick="criarCampanhaNr1()">Criar como rascunho</button>
          <button class="btn btn-ghost" onclick="_nr1NovaCampanhaAberta=false;render();">Cancelar</button>
        </div>`
          : ''
      }
      ${
        _nr1Campanhas.length
          ? `<table style="margin-top:14px;"><thead><tr><th>Campanha</th><th>Público</th><th>Período</th><th>Status</th><th></th></tr></thead><tbody>
            ${_nr1Campanhas
              .slice()
              .sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
              .map(
                (c) => `<tr>
                <td><b>${escaparHtml(c.nome)}</b>${c.autoEncerrada ? '<br><span class="small-muted" style="font-size:11px;">Encerrada automaticamente na data de fim</span>' : ''}</td>
                <td class="small-muted">${escaparHtml(nr1DescricaoPublico(c.publico))}<br>${nr1ColaboradoresElegiveis(c.publico).length} elegível(is)</td>
                <td class="small-muted">${new Date(`${c.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${c.dataFim}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                <td><span class="pill ${_nr1StatusPill(c.status)}">${_nr1StatusLabel(c.status)}</span></td>
                <td style="text-align:right;white-space:nowrap;">
                  ${c.status === 'rascunho' ? `<button class="btn btn-sm btn-primary" onclick="publicarCampanhaNr1('${c.id}')" ${temSst ? '' : 'disabled title="Defina o responsável técnico primeiro"'}>Publicar</button>` : ''}
                  ${c.status === 'ativa' ? `<button class="btn btn-sm btn-ghost" onclick="encerrarCampanhaNr1('${c.id}')">Encerrar</button>` : ''}
                  ${
                    c.status !== 'rascunho'
                      ? `<button class="btn btn-sm btn-ghost" onclick="alternarResultadoNr1('${c.id}')">${_nr1CampanhaResultadoAberta === c.id ? 'Ocultar resultado' : 'Ver resultado'}</button>
                         <button class="btn btn-sm btn-ghost" onclick="exportarRelatorioNr1PDF('${c.id}')" title="Baixar relatório em PDF para enviar ao SST">Exportar PDF</button>`
                      : ''
                  }
                </td>
              </tr>
              ${_nr1CampanhaResultadoAberta === c.id ? `<tr><td colspan="5">${renderResultadoCampanhaNr1(c)}</td></tr>` : ''}`
              )
              .join('')}
          </tbody></table>`
          : `<div class="empty" style="margin-top:10px;">${_nr1CampanhasCarregando ? 'Carregando campanhas…' : 'Nenhuma campanha criada ainda.'}</div>`
      }
    </div>

    ${renderPainelExecutivoNr1()}
    ${renderInventarioRiscosNr1()}

    <div class="card">
      <h3>Dimensões e perguntas <small>modelo genérico — edite antes de publicar, se quiser</small></h3>
      <div class="notice info">As perguntas abaixo foram escritas de forma genérica pelo INETRIS (não são cópia de nenhum instrumento comercial). Antes de usar com um cliente real, valide o conteúdo com um profissional de SST.</div>
      ${state.nr1.dimensoes
        .map(
          (d) => `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);">
          <div style="font-weight:600;font-size:13px;">${escaparHtml(d.nome)}</div>
          <ul style="margin:6px 0 0 18px;font-size:13px;color:var(--ink-dim);">
            ${d.perguntas.map((p) => `<li>${escaparHtml(p)}</li>`).join('')}
          </ul>
        </div>`
        )
        .join('')}
    </div>
    `
    }
  `;
}
