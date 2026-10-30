/* =========================================================
   MÓDULO R&S — RECRUTAMENTO E SELEÇÃO (Fase 1: fundação)
   -----------------------------------------------------------
   Ordem recomendada pela especificação: requisição de vaga →
   aprovação → publicação → candidatos → pipeline → proposta →
   conversão em colaborador. Esta fase cobre requisição+aprovação
   e o pipeline básico de candidatos, com cadastro MANUAL (sem
   página pública de candidatura ainda — decisão tomada para
   simplificar o início). A vaga herda dados do cargo escolhido,
   sem alterar o desenho original do cargo (RN da especificação).
   ========================================================= */

const MOTIVOS_VAGA_RS = ['Substituição', 'Aumento de quadro', 'Temporária', 'Estágio', 'Banco de talentos', 'Outro'];

function garantirRS() {
  if (!state.rs) state.rs = { requisicoes: [], candidatos: [] };
  if (!state.rs.requisicoes) state.rs.requisicoes = [];
  if (!state.rs.candidatos) state.rs.candidatos = [];
  if (!state.rs.configEtapas) state.rs.configEtapas = {};
  migrarEtapasLegadasRS(state.rs.candidatos, typeof meuPerfilId !== 'undefined' ? meuPerfilId : null);
}

function _rsEtapaNome(id) {
  return etapaNomeRS(id);
}
function _rsStatusRequisicaoPill(r) {
  if (r.status === 'reprovada') return { label: 'Reprovada', classe: 'pill-iniciar' };
  if (r.status === 'pendente') return { label: 'Aguardando aprovação', classe: 'pill-desenvolver' };
  if (r.encerrada) return { label: 'Encerrada', classe: 'pill-neutral' };
  if (r.publicada) return { label: 'Vaga aberta', classe: 'pill-alavancar' };
  return { label: 'Aprovada — não publicada', classe: 'pill-desenvolver' };
}

/* ---------- Requisição de vaga ---------- */
let _rsNovaRequisicaoAberta = false;
let _rsRequisicaoExpandida = null; // id da vaga que o QUADRO mostra (ver js/48)

function abrirNovaRequisicaoRS() {
  _rsNovaRequisicaoAberta = true;
  render();
}

function criarRequisicaoRS() {
  const cargoId = document.getElementById('rs_req_cargo').value;
  const unidadeId = document.getElementById('rs_req_unidade').value || null;
  const setorId = document.getElementById('rs_req_setor').value || null;
  const quantidade = parseInt(document.getElementById('rs_req_qtd').value, 10) || 1;
  const motivo = document.getElementById('rs_req_motivo').value;
  const prazo = document.getElementById('rs_req_prazo').value || null;
  const confidencial = document.getElementById('rs_req_confidencial').checked;
  if (!cargoId) {
    showToast('Selecione o cargo da vaga.');
    return;
  }
  const cargo = state.cargos.find((c) => c.id === cargoId);
  // A vaga herda missão/requisitos do desenho de cargo — sem alterar o cargo original.
  const d = cargo?.desenho || {};
  state.rs.requisicoes.push({
    id: uid(),
    codigo: `REQ-${String(state.rs.requisicoes.length + 1).padStart(3, '0')}`,
    cargoId,
    unidadeId,
    setorId,
    quantidade,
    motivo,
    prazo,
    confidencial,
    etapasAtivas: etapasMarcadasRS([...document.querySelectorAll('.rs-req-etapa:checked')].map((el) => el.value)),
    missaoHerdada: d.missao || '',
    responsabilidadesHerdadas: d.responsabilidades || [],
    gestorSolicitanteId: meuPerfilId,
    status: 'pendente', // pendente | aprovada | reprovada
    publicada: false,
    encerrada: false,
    candidatosCount: 0,
    // Perfil desejado pra vaga — usado no pipeline pra comparar com o que
    // o candidato informou na candidatura, e pode alimentar a página
    // pública (requisitos/atividades) quando publicar.
    perfilDesejado: {
      nivelMaturidade: document.getElementById('rs_req_nivel').value,
      perfilDiscDesejado: document.getElementById('rs_req_disc').value.trim(),
      personalidadeOutra: document.getElementById('rs_req_personalidade').value.trim(),
      hardSkills: document.getElementById('rs_req_hard').value.trim(),
      softSkills: document.getElementById('rs_req_soft').value.trim(),
      principaisAtividades: document.getElementById('rs_req_atividades').value.trim(),
      salarioFixo: document.getElementById('rs_req_salario').value.trim(),
      remuneracaoVariavel: document.getElementById('rs_req_variavel').value.trim(),
      formatoContratacao: document.getElementById('rs_req_formato').value,
      disponibilidadeHorarios: document.getElementById('rs_req_disponibilidade').value,
      experienciaAnteriorNecessaria: document.getElementById('rs_req_experiencia').value.trim(),
      requisitoMoto: document.getElementById('rs_req_moto').checked,
      requisitoNotebook: document.getElementById('rs_req_notebook').checked,
      requisitoSmartphone: document.getElementById('rs_req_smartphone').checked,
      intimidadeTecnologiaNecessaria: document.getElementById('rs_req_tecnologia').value,
      excelNecessario: document.getElementById('rs_req_excel').value,
      wordNecessario: document.getElementById('rs_req_word').value,
      powerpointNecessario: document.getElementById('rs_req_powerpoint').value,
      internoExterno: document.getElementById('rs_req_local_tipo').value,
      cidade: document.getElementById('rs_req_cidade').value.trim(),
      formacaoSuperiorNecessaria: document.getElementById('rs_req_formacao').value,
    },
    ...novoCarimbo(),
  });
  _rsNovaRequisicaoAberta = false;
  showToast('Requisição criada e enviada para aprovação.');
  render();
}

function decidirRequisicaoRS(id, aprovar) {
  const r = state.rs.requisicoes.find((x) => x.id === id);
  if (!r) return;
  if (!aprovar) {
    const motivo = prompt('Motivo da reprovação/devolução:') || '';
    r.motivoDecisao = motivo;
    r.status = 'reprovada';
  } else {
    r.status = 'aprovada';
  }
  r.decididoPor = meuPerfilId;
  r.decididoEm = new Date().toISOString();
  showToast(aprovar ? 'Requisição aprovada.' : 'Requisição reprovada.');
  render();
}

let _rsConfigurarPublicaAberta = null; // id da requisição com o formulário de página pública aberto

function abrirConfigurarPaginaPublicaRS(id) {
  _rsConfigurarPublicaAberta = id;
  render();
}

async function publicarVagaRS(id) {
  const r = state.rs.requisicoes.find((x) => x.id === id);
  if (!r || r.status !== 'aprovada') return;
  const cargo = state.cargos.find((c) => c.id === r.cargoId);
  const pd = r.perfilDesejado || {};
  const titulo = document.getElementById('rs_pub_titulo').value.trim() || cargo?.nome || 'Vaga';
  const modalidade = document.getElementById('rs_pub_modalidade').value;
  const mostrarSalario = document.getElementById('rs_pub_mostrar_salario').checked;
  const faixaSalarial = document.getElementById('rs_pub_faixa').value.trim();
  const mostrarEmpresa = document.getElementById('rs_pub_mostrar_empresa').checked;
  const jovemAprendiz = pd.formatoContratacao === 'Jovem Aprendiz';

  // Descrição, requisitos e local não são mais digitados de novo aqui —
  // vêm automaticamente do que já foi preenchido na requisição (perfil
  // desejado), pra não pedir a mesma informação duas vezes.
  const descricao = pd.principaisAtividades || r.missaoHerdada || '';
  const requisitos = [
    pd.hardSkills && `Hard skills: ${pd.hardSkills}`,
    pd.softSkills && `Soft skills: ${pd.softSkills}`,
    pd.experienciaAnteriorNecessaria && `Experiência: ${pd.experienciaAnteriorNecessaria}`,
    pd.formacaoSuperiorNecessaria &&
      pd.formacaoSuperiorNecessaria !== 'nao_exigido' &&
      `Formação superior: ${RS_LABEL_FORMACAO[pd.formacaoSuperiorNecessaria] || pd.formacaoSuperiorNecessaria}`,
  ]
    .filter(Boolean)
    .join('\n');
  const local = pd.cidade || '';

  const { data, error } = await sb.functions.invoke('rs', {
    body: {
      action: 'sync_vaga_publica',
      requisicaoId: r.id,
      titulo,
      descricao,
      requisitos,
      local,
      modalidade,
      mostrarSalario,
      faixaSalarial,
      mostrarEmpresa,
      jovemAprendiz,
      nomeEmpresaExibicao: state.empresa?.nomeFantasia || '',
    },
  });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível publicar a página pública.');
    return;
  }
  r.publicada = true;
  r.publicadaEm = new Date().toISOString();
  r.vagaPublicaId = data.vagaPublicaId;
  _rsConfigurarPublicaAberta = null;
  showToast('Vaga publicada! Copie o link abaixo pra divulgar.');
  render();
}

function linkPublicoRS(r) {
  if (!r.vagaPublicaId) return '';
  // BUG CORRIGIDO: antes, isso dependia do nome do arquivo atual ser
  // "index.html" (trocava por vazio) — quebrou quando o sistema passou a
  // rodar em "app.html" (v0.98.1), virando "app.htmlvaga.html" sem barra
  // nenhuma. Agora pega só a PASTA (tudo até a última barra), não importa
  // qual é o nome do arquivo atual.
  const pasta = location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
  return `${location.origin}${pasta}vaga.html?v=${r.vagaPublicaId}`;
}

function copiarLinkPublicoRS(id) {
  const r = state.rs.requisicoes.find((x) => x.id === id);
  if (!r) return;
  const link = linkPublicoRS(r);
  navigator.clipboard?.writeText(link);
  showToast('Link copiado! Cole onde quiser divulgar a vaga.');
}

async function encerrarVagaRS(id) {
  const r = state.rs.requisicoes.find((x) => x.id === id);
  if (!r) return;
  const motivo = prompt('Motivo do encerramento (ex: vaga preenchida, cancelada, congelada):') || '';
  r.encerrada = true;
  r.motivoEncerramento = motivo;
  r.encerradaEm = new Date().toISOString();
  if (r.vagaPublicaId) {
    await sb.functions.invoke('rs', { body: { action: 'desativar_vaga_publica', requisicaoId: r.id } }).catch(() => {});
  }
  render();
}

/* ---------- Candidatos e pipeline ---------- */

// Templates de e-mail por etapa — o candidato é avisado a cada mudança,
// pra nunca ficar "no vácuo" sobre o processo. Best-effort: se o envio
// falhar (e-mail inválido, serviço fora do ar), só registra no console —
// nunca trava o RH de mover o candidato no pipeline.
const RS_EMAIL_POR_ETAPA = {
  nova: {
    assunto: 'Recebemos sua candidatura',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Recebemos sua candidatura para a vaga <b>${vaga}</b>. Nossa equipe vai analisar seu perfil e retornaremos em breve.</p>`,
  },
  triagem: {
    assunto: 'Sua candidatura está em triagem',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Seu currículo para a vaga <b>${vaga}</b> está sendo analisado pela nossa equipe de recrutamento.</p>`,
  },
  contato_inicial: {
    assunto: 'Vamos entrar em contato com você',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Boas notícias — avançamos com sua candidatura para <b>${vaga}</b>. Em breve entraremos em contato para os próximos passos.</p>`,
  },
  avaliacao: {
    assunto: 'Sua candidatura está em avaliação',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Seu perfil para a vaga <b>${vaga}</b> está sendo avaliado com atenção pela nossa equipe.</p>`,
  },
  entrevista: {
    assunto: 'Você foi selecionado(a) para uma entrevista',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a etapa de <b>entrevista</b> na vaga <b>${vaga}</b>. Em breve alguém da nossa equipe vai combinar o horário com você.</p>`,
  },
  finalista: {
    assunto: 'Você está entre os finalistas!',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Ótima notícia — você está entre os <b>finalistas</b> para a vaga <b>${vaga}</b>. Estamos concluindo a avaliação e retornaremos em breve.</p>`,
  },
  proposta: {
    assunto: 'Estamos preparando uma proposta para você',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Temos uma ótima notícia — estamos preparando uma proposta para você na vaga <b>${vaga}</b>. Em breve entraremos em contato com os detalhes.</p>`,
  },
  aprovado: {
    assunto: 'Parabéns! Você foi aprovado(a)',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p><b>Parabéns!</b> Você foi aprovado(a) para a vaga <b>${vaga}</b>. Nossa equipe entrará em contato com os próximos passos para sua contratação.</p>`,
  },
  disc_galt: {
    assunto: 'Próxima etapa: avaliação de perfil',
    corpo: (nome, vaga, orientacoes) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a próxima etapa do processo seletivo da vaga <b>${vaga}</b>: uma avaliação de perfil e raciocínio. ${orientacoes ? 'O passo a passo e as orientações da empresa estão logo abaixo.' : 'O passo a passo está abaixo; as instruções específicas (como links) nossa equipe enviará em breve.'}</p>`,
  },
  video: {
    assunto: 'Próxima etapa: vídeo de apresentação',
    corpo: (nome, vaga, orientacoes) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a etapa de <b>vídeo de apresentação</b> da vaga <b>${vaga}</b>. ${orientacoes ? 'O passo a passo e as orientações da empresa estão logo abaixo.' : 'O passo a passo está abaixo; as instruções específicas para o envio do vídeo nossa equipe enviará em breve.'}</p>`,
  },
  entrevista_fit: {
    assunto: 'Você avançou para a entrevista!',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a <b>entrevista de alinhamento com a cultura da empresa</b> na vaga <b>${vaga}</b>. Em breve alguém da nossa equipe vai combinar o horário com você.</p>`,
  },
  teste_logico: {
    assunto: 'Próxima etapa: teste lógico',
    corpo: (nome, vaga, orientacoes) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para o <b>teste lógico</b> da vaga <b>${vaga}</b>. ${orientacoes ? 'O passo a passo e as orientações da empresa estão logo abaixo.' : 'O passo a passo está abaixo; as instruções específicas (como links) nossa equipe enviará em breve.'}</p>`,
  },
  prova_teorica: {
    assunto: 'Próxima etapa: prova teórica',
    corpo: (nome, vaga, orientacoes) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a <b>prova teórica</b> da vaga <b>${vaga}</b>. ${orientacoes ? 'O passo a passo e as orientações da empresa estão logo abaixo.' : 'O passo a passo está abaixo; as instruções específicas (como links) nossa equipe enviará em breve.'}</p>`,
  },
  prova_pratica: {
    assunto: 'Próxima etapa: prova prática',
    corpo: (nome, vaga, orientacoes) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a <b>prova prática</b> da vaga <b>${vaga}</b>. ${orientacoes ? 'O passo a passo e as orientações da empresa estão logo abaixo.' : 'O passo a passo está abaixo; as instruções específicas (como links) nossa equipe enviará em breve.'}</p>`,
  },
  entrevista_final: {
    assunto: 'Você avançou para a entrevista final!',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Você avançou para a <b>entrevista final</b> na vaga <b>${vaga}</b>. Em breve alguém da nossa equipe vai combinar o horário com você.</p>`,
  },
  escolha: {
    assunto: 'Você está entre os finalistas!',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Ótima notícia — você está entre os <b>finalistas</b> para a vaga <b>${vaga}</b>. Estamos concluindo a avaliação e retornaremos em breve.</p>`,
  },
  reprovado: {
    assunto: 'Sobre sua candidatura',
    corpo: (nome, vaga) =>
      `<p>Olá, ${nome}!</p><p>Agradecemos muito seu interesse e o tempo dedicado ao processo seletivo para a vaga <b>${vaga}</b>. Neste momento, optamos por seguir com outro(a) candidato(a). Seu perfil fica registrado para futuras oportunidades compatíveis.</p>`,
  },
};

// O PASSO A PASSO que vai em TODO e-mail de etapa ("como fazer"). Texto padrão, sem prometer o que o sistema não sabe
// (endereços, horários, links): os detalhes da empresa ou da vaga entram logo depois, em "Orientações".
const COMO_FAZER_ETAPA_RS = {
  nova: {
    titulo: 'O que acontece agora',
    passos: [
      'Você não precisa fazer nada neste momento.',
      'Vamos analisar o seu currículo.',
      'A cada nova etapa você receberá um e-mail como este, explicando o que fazer.',
    ],
  },
  triagem: {
    titulo: 'O que acontece agora',
    passos: [
      'Você não precisa fazer nada agora: estamos analisando o seu currículo.',
      'Se você avançar, enviaremos um novo e-mail explicando a próxima etapa.',
    ],
  },
  disc_galt: {
    titulo: 'Como fazer',
    passos: [
      'Abra cada link de teste indicado nas orientações abaixo.',
      'Responda com calma e sinceridade, no seu ritmo: não existem respostas certas ou erradas.',
      'Ao terminar, guarde o resultado (print ou PDF).',
      'Envie o resultado da forma indicada neste e-mail.',
    ],
  },
  video: {
    titulo: 'Como fazer',
    passos: [
      'Você receberá um link pessoal para enviar o vídeo.',
      'Grave pela câmera do celular ou do computador, ou escolha um arquivo de até 2 minutos.',
      'Assista ao vídeo antes de enviar. Depois de enviado, ele não pode ser trocado.',
    ],
  },
  entrevista_fit: {
    titulo: 'Como se preparar',
    passos: [
      'Nossa equipe vai combinar com você o dia e o horário.',
      'Se for online, escolha um lugar tranquilo e confira sua conexão antes.',
      'Se for presencial, chegue com alguns minutos de antecedência.',
      'Se tiver algum imprevisto, avise a equipe o quanto antes.',
    ],
  },
  teste_logico: {
    titulo: 'Como fazer',
    passos: [
      'Reserve um tempo sem interrupções.',
      'Leia as instruções do teste com atenção antes de começar.',
      'Siga as orientações deste e-mail para acessar o teste e entregar o resultado.',
      'Se tiver dúvida, fale com a equipe antes do prazo.',
    ],
  },
  prova_teorica: {
    titulo: 'Como fazer',
    passos: [
      'Reserve um tempo sem interrupções.',
      'Leia as instruções da prova com atenção antes de começar.',
      'Siga as orientações deste e-mail para acessar a prova e entregar o resultado.',
      'Se tiver dúvida, fale com a equipe antes do prazo.',
    ],
  },
  prova_pratica: {
    titulo: 'Como fazer',
    passos: [
      'Leia com atenção o enunciado da prova prática abaixo.',
      'Faça a tarefa no seu ritmo, respeitando o prazo de entrega.',
      'Entregue da forma indicada neste e-mail.',
      'Se tiver dúvida, fale com a equipe antes do prazo.',
    ],
  },
  entrevista_final: {
    titulo: 'Como se preparar',
    passos: [
      'Nossa equipe vai combinar com você o dia e o horário.',
      'Prepare-se para conversar sobre a sua trajetória e a vaga.',
      'Se for online, escolha um lugar tranquilo e confira sua conexão antes.',
      'Se tiver algum imprevisto, avise a equipe o quanto antes.',
    ],
  },
  escolha: {
    titulo: 'O que acontece agora',
    passos: ['Você não precisa fazer nada agora.', 'Estamos concluindo a avaliação e retornaremos em breve.'],
  },
  proposta: {
    titulo: 'O que fazer agora',
    passos: [
      'Leia a proposta com atenção.',
      'Se tiver dúvidas, fale com a equipe.',
      'Avise a equipe assim que tomar a sua decisão.',
    ],
  },
  aprovado: {
    titulo: 'O que acontece agora',
    passos: [
      'Nossa equipe vai combinar com você os próximos passos da contratação.',
      'Fique atento ao seu e-mail: a equipe informará quais documentos e datas serão necessários.',
    ],
  },
};

function comoFazerEtapaHtml(etapa) {
  const c = COMO_FAZER_ETAPA_RS[etapa];
  if (!c) return '';
  return `<p><b>${c.titulo}:</b></p><ol>${c.passos.map((p) => `<li>${p}</li>`).join('')}</ol>`;
}

// Monta o e-mail da etapa: o texto da etapa + o "Como fazer" + as orientações da vaga (ou da empresa). Pura: serve para enviar e
// para a pré-visualização. Nome e vaga entram escapados (o nome vem do formulário público).
// O botão "Enviar meu resultado" (só entra se o pedido foi criado e o link é um endereço https de verdade).
function blocoEntregaEmailHtml(entrega) {
  const link = urlSegura(entrega && entrega.link);
  if (!link) return '';
  const ate = entrega.prazoISO ? new Date(entrega.prazoISO).toLocaleDateString('pt-BR') : '';
  return `<p><b>Enviar o resultado:</b> quando terminar, envie o resultado (PDF, imagem ou texto) pelo botão abaixo. Você pode anexar até 3 arquivos de 5 MB.</p><p><a href="${escaparHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Enviar meu resultado</a></p><p style="font-size:12px;color:#666;">O link é pessoal${ate ? ` e vale até ${ate}` : ''}: não compartilhe.</p>`;
}

function montarEmailEtapaRS({ nome, nomeVaga, etapa, cfg, hoje, entrega }) {
  const tpl = RS_EMAIL_POR_ETAPA[etapa];
  if (!tpl) return null;
  const corpoHtml =
    tpl.corpo(escaparHtml(nome), escaparHtml(nomeVaga), temOrientacoesEtapaRS(cfg, etapa)) +
    comoFazerEtapaHtml(etapa) +
    blocoConfigEtapaHtml(cfg, etapa, hoje) +
    blocoEntregaEmailHtml(entrega);
  return { assunto: tpl.assunto, corpoHtml };
}

// O e-mail como o candidato vai recebê-lo (com um nome de exemplo), para o RH conferir ao configurar a etapa.
function previaEmailEtapaRS(etapa, nomeVaga, cfg) {
  if (etapa === 'video')
    return '<p><i>O e-mail desta etapa é gerado pelo pedido de vídeo: leva o link pessoal do candidato, o limite de 2 minutos, o prazo de envio e as orientações que você escrever.</i></p>';
  const entrega = ETAPAS_COM_ENTREGA_RS.includes(etapa)
    ? {
        link: 'https://seusite.com.br/entrega.html?t=exemplo',
        prazoISO: new Date(Date.now() + 7 * 86400000).toISOString(),
      }
    : undefined;
  const m = montarEmailEtapaRS({ nome: 'Maria', nomeVaga: nomeVaga || 'Vendedor', etapa, cfg, entrega });
  if (!m) return '<p><i>Esta etapa não envia e-mail ao candidato.</i></p>';
  return `<p><b>Assunto:</b> ${escaparHtml(m.assunto)}</p>${m.corpoHtml}`;
}

async function enviarEmailEtapaRS(candidato, etapa, extra = {}) {
  const tpl = RS_EMAIL_POR_ETAPA[etapa];
  if (!tpl || !candidato.email) return;
  const vaga = state.rs.requisicoes.find((r) => r.id === candidato.vagaId);
  const nomeVaga = vaga ? state.cargos.find((c) => c.id === vaga.cargoId)?.nome || vaga.codigo : 'nossa vaga';
  const cfgEtapa = configEfetivaEtapaRS(vaga, etapa); // orientações da vaga (ou, na falta, as da empresa)
  const email = montarEmailEtapaRS({ nome: candidato.nome, nomeVaga, etapa, cfg: cfgEtapa, entrega: extra.entrega });
  try {
    await sb.functions.invoke('enviar-email', {
      // O nome do candidato vem do formulário público: o montador escapa, senão dava pra mandar HTML
      // (links) dentro de um e-mail da INETRIS pro endereço de qualquer pessoa.
      body: { destinatario: candidato.email, assunto: email.assunto, corpoHtml: email.corpoHtml },
    });
  } catch (e) {
    console.warn('Falha ao enviar e-mail de atualização de candidatura (não bloqueia o pipeline)', e);
  }
}

function moverEtapaCandidatoRS(candidatoId, novaEtapa) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  const anterior = cand.etapa;
  if (anterior === novaEtapa) return;
  // DISC/GALT, teste lógico e prova teórica dependem de links e instruções: sem eles o candidato recebe só o passo a passo padrão.
  if (ETAPAS_QUE_PRECISAM_ORIENTACAO_RS.includes(novaEtapa)) {
    const vagaDoCandidato = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
    if (
      !temOrientacoesEtapaRS(configEfetivaEtapaRS(vagaDoCandidato, novaEtapa), novaEtapa) &&
      !confirm(
        `Esta etapa (${etapaNomeRS(novaEtapa)}) ainda não tem links nem orientações configurados. O candidato receberá só o passo a passo padrão, sem o endereço do teste.\n\nConfigure em "Orientações e links que o candidato recebe" (ou em "Configurar esta vaga").\n\nMover mesmo assim?`
      )
    ) {
      render(); // volta o seletor/cartão para a etapa em que o candidato estava
      return;
    }
  }
  // A prova prática é criada POR VAGA: avisa antes de mandar um candidato pra ela se esta vaga ainda não definiu a sua.
  if (novaEtapa === 'prova_pratica') {
    const vagaDoCandidato = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
    if (
      !provaPraticaDefinidaRS(vagaDoCandidato) &&
      !confirm(
        'Esta vaga ainda não tem a prova prática definida (enunciado, prazo e critérios). O candidato receberá o e-mail da etapa sem a tarefa.\n\nMover mesmo assim?'
      )
    ) {
      render(); // volta o seletor para a etapa em que o candidato estava
      return;
    }
  }
  cand.etapa = novaEtapa;
  cand.historico.push({
    de: anterior,
    para: novaEtapa,
    autorId: meuPerfilId,
    em: new Date().toISOString(),
    observacao: '',
  });
  if (novaEtapa === 'video' && rsVideoHabilitado()) {
    // Entrar na etapa de vídeo já cria o pedido e manda o link (com as orientações da vaga): não manda também o aviso genérico.
    pedirVideoRS(cand.id, { automatico: true });
  } else if (ETAPAS_COM_ENTREGA_RS.includes(novaEtapa) && rsEntregaHabilitado()) {
    // Etapa com teste/entrega: cria o pedido e manda o e-mail da etapa JÁ com o botão "Enviar meu resultado".
    enviarEtapaComEntregaRS(cand, novaEtapa);
  } else {
    enviarEmailEtapaRS(cand, novaEtapa);
    showToast(`Etapa atualizada — e-mail enviado a ${cand.nome}.`);
  }
  render();
}

function reprovarCandidatoRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  const motivo = prompt('Motivo da reprovação/desistência (fica no histórico). O candidato será avisado por e-mail.');
  if (motivo === null) return;
  cand.reprovado = true;
  cand.historico.push({
    de: cand.etapa,
    para: 'reprovado',
    autorId: meuPerfilId,
    em: new Date().toISOString(),
    observacao: motivo,
  });
  enviarEmailEtapaRS(cand, 'reprovado');
  showToast(`Candidato reprovado — e-mail enviado a ${cand.nome}.`);
  render();
}

function reabrirCandidatoRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  cand.reprovado = false;
  // deixa registro: sem isso o histórico termina em "reprovado" e os relatórios não sabem quando o candidato voltou
  cand.historico = cand.historico || [];
  cand.historico.push({
    de: 'reprovado',
    para: cand.etapa,
    autorId: meuPerfilId,
    em: new Date().toISOString(),
    observacao: 'Reaberto',
  });
  render();
}

/* ---------- Scorecard de entrevista ---------- */
// Critérios vêm das competências comportamentais já cadastradas no
// desenho do cargo — não inventa um formulário novo por fora do que a
// empresa já definiu pra aquele cargo.
let _rsScorecardAberto = null; // id do candidato com o formulário aberto
let _rsScorecardExpandido = null; // id do candidato com a lista de scorecards já enviados aberta

function abrirScorecardRS(candidatoId) {
  _rsScorecardAberto = candidatoId;
  render();
}

function criarScorecardRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  const vaga = cand && state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const cargo = vaga && state.cargos.find((c) => c.id === vaga.cargoId);
  const criterios = cargo?.desenho?.competenciasComportamentais?.length
    ? cargo.desenho.competenciasComportamentais
    : ['Comunicação', 'Postura profissional', 'Alinhamento com a vaga'];
  const notas = criterios.map(
    (_, i) => parseInt(document.getElementById(`rs_sc_nota_${candidatoId}_${i}`).value, 10) || 3
  );
  const recomendacao = document.getElementById(`rs_sc_recomendacao_${candidatoId}`).value;
  const observacoes = document.getElementById(`rs_sc_obs_${candidatoId}`).value.trim();
  cand.scorecards = cand.scorecards || [];
  cand.scorecards.push({
    id: uid(),
    avaliadorId: meuPerfilId,
    criterios: criterios.map((nome, i) => ({ nome, nota: notas[i] })),
    recomendacao,
    observacoes,
    criadoEm: new Date().toISOString(),
  });
  _rsScorecardAberto = null;
  showToast('Scorecard registrado.');
  render();
}

function _rsMediaScorecard(sc) {
  if (!sc.criterios.length) return 0;
  return sc.criterios.reduce((soma, c) => soma + c.nota, 0) / sc.criterios.length;
}

let _rsPerfilExpandido = null; // id do candidato com o perfil detalhado aberto

const RS_LABEL_NIVEL = {
  nao_exigido: 'Não exigido',
  nao_possui: 'Não possui',
  basico: 'Básico',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};
const RS_LABEL_FORMACAO = {
  nao_exigido: 'Não exigida',
  nao_possui: 'Não possui',
  cursando: 'Cursando',
  completo: 'Completa',
};
const RS_LABEL_DISPONIBILIDADE = {
  comercial: 'Horário comercial',
  turnos: 'Turnos',
  flexivel: 'Flexível',
  fins_de_semana: 'Inclui finais de semana',
};

function renderPerfilCandidatoRS(c) {
  if (!c.perfil) return '';
  const p = c.perfil;
  const linhas = [
    ['Maior de 18 anos', p.maior18 ? 'Sim' : '—'],
    ['Cidade atual', p.cidadeAtual || '—'],
    ['Formação superior', RS_LABEL_FORMACAO[p.formacaoSuperior] || '—'],
    ['Disponibilidade', RS_LABEL_DISPONIBILIDADE[p.disponibilidadeHorarios] || '—'],
    [
      'Possui',
      [p.possuiMoto && 'Moto', p.possuiNotebook && 'Notebook', p.possuiSmartphone && 'Smartphone']
        .filter(Boolean)
        .join(', ') || 'Nenhum informado',
    ],
    ['Intimidade com tecnologia', RS_LABEL_NIVEL[p.intimidadeTecnologia] || '—'],
    [
      'Excel / Word / PowerPoint',
      `${RS_LABEL_NIVEL[p.conhecimentoExcel] || '—'} / ${RS_LABEL_NIVEL[p.conhecimentoWord] || '—'} / ${RS_LABEL_NIVEL[p.conhecimentoPowerpoint] || '—'}`,
    ],
    ['LinkedIn', p.linkedin || '—'],
  ];
  if (p.experienciaAnteriorFuncao) linhas.push(['Experiência anterior', p.experienciaAnteriorFuncao]);

  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
      <button class="btn btn-ghost btn-sm" onclick="_rsPerfilExpandido = _rsPerfilExpandido==='${c.id}'?null:'${c.id}'; render();">
        👤 ${_rsPerfilExpandido === c.id ? 'Ocultar perfil do candidato' : 'Ver perfil do candidato'}
      </button>
      ${
        _rsPerfilExpandido === c.id
          ? `<div class="card" style="margin-top:8px;font-size:12.5px;">
          ${linhas.map(([label, valor]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--line);"><span class="small-muted">${label}</span><span style="text-align:right;">${escaparHtml(String(valor))}</span></div>`).join('')}
        </div>`
          : ''
      }
    </div>`;
}

function renderScorecardRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return '';
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const cargo = vaga && state.cargos.find((c) => c.id === vaga.cargoId);
  const criterios = cargo?.desenho?.competenciasComportamentais?.length
    ? cargo.desenho.competenciasComportamentais
    : ['Comunicação', 'Postura profissional', 'Alinhamento com a vaga'];
  const scorecards = cand.scorecards || [];

  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button class="btn btn-ghost btn-sm" onclick="_rsScorecardExpandido = _rsScorecardExpandido==='${candidatoId}'?null:'${candidatoId}'; render();">
          📋 Scorecards (${scorecards.length})
        </button>
        <button class="btn btn-ghost btn-sm" onclick="abrirScorecardRS('${candidatoId}')">+ Novo scorecard</button>
      </div>
      ${
        _rsScorecardAberto === candidatoId
          ? `<div class="card" style="margin-top:8px;">
          <h4 style="font-size:13px;margin-bottom:8px;">Novo scorecard de entrevista</h4>
          ${criterios
            .map(
              (crit, i) => `
            <div class="field" style="margin-bottom:8px;">
              <label>${escaparHtml(crit)} <small>(1 a 5)</small></label>
              <select id="rs_sc_nota_${candidatoId}_${i}">
                <option value="1">1 — Muito abaixo do esperado</option>
                <option value="2">2 — Abaixo do esperado</option>
                <option value="3" selected>3 — Dentro do esperado</option>
                <option value="4">4 — Acima do esperado</option>
                <option value="5">5 — Muito acima do esperado</option>
              </select>
            </div>`
            )
            .join('')}
          <div class="field"><label>Recomendação</label>
            <select id="rs_sc_recomendacao_${candidatoId}">
              <option value="avancar">Avançar no processo</option>
              <option value="neutro">Neutro / preciso de outra opinião</option>
              <option value="nao_avancar">Não avançar</option>
            </select>
          </div>
          <div class="field"><label>Observações</label><textarea id="rs_sc_obs_${candidatoId}"></textarea></div>
          <button class="btn btn-primary btn-sm" onclick="criarScorecardRS('${candidatoId}')">Salvar scorecard</button>
          <button class="btn btn-ghost btn-sm" onclick="_rsScorecardAberto=null;render();">Cancelar</button>
        </div>`
          : ''
      }
      ${
        _rsScorecardExpandido === candidatoId && scorecards.length
          ? `<div style="margin-top:8px;">
          ${scorecards
            .map((sc) => {
              const avaliador = (_perfisEmpresa || []).find((p) => p.id === sc.avaliadorId);
              const media = _rsMediaScorecard(sc);
              const corRecomendacao =
                sc.recomendacao === 'avancar'
                  ? 'pill-alavancar'
                  : sc.recomendacao === 'nao_avancar'
                    ? 'pill-iniciar'
                    : 'pill-desenvolver';
              const labelRecomendacao =
                sc.recomendacao === 'avancar'
                  ? 'Avançar'
                  : sc.recomendacao === 'nao_avancar'
                    ? 'Não avançar'
                    : 'Neutro';
              return `<div style="padding:8px 0;border-top:1px solid var(--line);font-size:12.5px;">
              <div style="display:flex;justify-content:space-between;">
                <b>${avaliador ? escaparHtml(avaliador.nome) : 'Avaliador'}</b>
                <span>Média: <b>${media.toFixed(1)}</b> · <span class="pill ${corRecomendacao}" style="font-size:10px;">${labelRecomendacao}</span></span>
              </div>
              <div class="small-muted" style="margin-top:2px;">${sc.criterios.map((c) => `${escaparHtml(c.nome)}: ${c.nota}`).join(' · ')}</div>
              ${sc.observacoes ? `<div class="small-muted" style="margin-top:2px;">"${escaparHtml(sc.observacoes)}"</div>` : ''}
            </div>`;
            })
            .join('')}
        </div>`
          : ''
      }
    </div>`;
}

// Converte um candidato Aprovado em colaborador — reaproveita só os dados
// necessários (nome e contato), preservando o histórico do processo seletivo.
function converterCandidatoEmColaboradorRS(candidatoId) {
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand || cand.etapa !== 'aprovado') return;
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  if (!confirm(`Converter "${cand.nome}" em colaborador? Isso cria um novo cadastro em Colaboradores.`)) return;
  state.colaboradores.push({
    id: uid(),
    nome: cand.nome,
    cargoId: vaga?.cargoId || null,
    unidadeId: vaga?.unidadeId || null,
    setorId: vaga?.setorId || null,
    admissao: hojeLocalISO(),
    perfilId: null,
    inativo: false,
  });
  cand.convertidoEm = new Date().toISOString();
  showToast(`"${cand.nome}" convertido em colaborador. Complete o cadastro em Colaboradores se necessário.`);
  render();
}

// Indicadores de recrutamento — tempo de contratação e taxa de aceite.
// Calculados sob demanda a partir do que já existe (requisições e
// candidatos), sem precisar guardar nenhum número à parte.
function renderIndicadoresRS() {
  const requisicoesConvertidas = state.rs.requisicoes.filter(
    (r) => r.publicadaEm && state.rs.candidatos.some((c) => c.vagaId === r.id && c.convertidoEm)
  );
  let tempoMedioDias = null;
  if (requisicoesConvertidas.length) {
    const dias = requisicoesConvertidas.map((r) => {
      const candidatoConvertido = state.rs.candidatos.find((c) => c.vagaId === r.id && c.convertidoEm);
      return (new Date(candidatoConvertido.convertidoEm) - new Date(r.publicadaEm)) / 86400000;
    });
    tempoMedioDias = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
  }

  // Taxa de aceite: dos candidatos que chegaram a receber uma proposta
  // (etapa "proposta" em algum momento do histórico), quantos realmente
  // foram aprovados (aceitaram) vs os que foram reprovados depois disso.
  const passaramPorProposta = state.rs.candidatos.filter((c) => (c.historico || []).some((h) => h.para === 'proposta'));
  const aceitaram = passaramPorProposta.filter((c) => c.etapa === 'aprovado' && !c.reprovado).length;
  const taxaAceite = passaramPorProposta.length ? Math.round((aceitaram / passaramPorProposta.length) * 100) : null;

  const totalCandidatos = state.rs.candidatos.filter((c) => c.vagaId).length;
  const totalVagasPublicadas = state.rs.requisicoes.filter((r) => r.publicada).length;
  const candidatosPorVaga = totalVagasPublicadas
    ? Math.round((totalCandidatos / totalVagasPublicadas) * 10) / 10
    : null;

  if (tempoMedioDias === null && taxaAceite === null && candidatosPorVaga === null) return '';
  return `
    <div class="painel-kpi-inetris">
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
        <div>
          <div class="kpi-card-label">Tempo médio de contratação</div>
          <div class="kpi-card-valor">${tempoMedioDias !== null ? `${tempoMedioDias} dias` : '—'}</div>
          <div class="kpi-card-nota">Da publicação até a conversão em colaborador</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
        <div>
          <div class="kpi-card-label">Taxa de aceite</div>
          <div class="kpi-card-valor">${taxaAceite !== null ? `${taxaAceite}%` : '—'}</div>
          <div class="kpi-card-nota">${passaramPorProposta.length ? `${aceitaram} de ${passaramPorProposta.length} propostas aceitas` : 'Nenhuma proposta feita ainda'}</div>
        </div>
      </div>
      <div class="kpi-card-inetris">
        <div class="kpi-card-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg></div>
        <div>
          <div class="kpi-card-label">Candidatos por vaga</div>
          <div class="kpi-card-valor">${candidatosPorVaga !== null ? candidatosPorVaga : '—'}</div>
          <div class="kpi-card-nota">Média entre as vagas publicadas</div>
        </div>
      </div>
    </div>`;
}

// As VAGAS (criar a requisição, aprovar, publicar o link, encerrar) e o funil de candidatos de cada uma.
// Este bloco aparece na tela "R&S — Processo seletivo"; o cadastro de pessoas fica em "R&S — Recrutamento" (js/47).
function rsRequisicoesCardHtml() {
  garantirRS();
  const souGestor = ['owner', 'rh'].includes(meuPapelReal);
  const cargosPublicados = state.cargos.filter((c) => c.desenho?.aprovado && !c.descontinuado);

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Requisições de vaga</h3>
        <button class="btn btn-primary btn-sm" onclick="abrirNovaRequisicaoRS()">Nova requisição</button>
      </div>
      ${
        _rsNovaRequisicaoAberta
          ? `
        <div class="card" style="background:var(--surface-2);margin-top:12px;">
          <h3 style="font-size:14px;">Nova requisição de vaga</h3>
          <div class="grid3">
            <div class="field"><label>Cargo</label>
              <select id="rs_req_cargo">
                <option value="">Selecione…</option>
                ${cargosPublicados.map((c) => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Unidade</label>
              <select id="rs_req_unidade"><option value="">—</option>${state.estrutura
                .filter((n) => n.tipo === 'unidade')
                .map((n) => `<option value="${n.id}">${escaparHtml(n.nome)}</option>`)
                .join('')}</select>
            </div>
            <div class="field"><label>Setor</label>
              <select id="rs_req_setor"><option value="">—</option>${state.estrutura
                .filter((n) => ['setor', 'equipe', 'departamento'].includes(n.tipo))
                .map((n) => `<option value="${n.id}">${escaparHtml(n.nome)}</option>`)
                .join('')}</select>
            </div>
          </div>
          <div class="grid3">
            <div class="field"><label>Quantidade</label><input id="rs_req_qtd" type="number" min="1" value="1"></div>
            <div class="field"><label>Motivo</label>
              <select id="rs_req_motivo">${MOTIVOS_VAGA_RS.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Prazo desejado</label><input id="rs_req_prazo" type="date"></div>
          </div>
          ${modeloProcessoSelectHtml()}
          <details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;font-size:13px;">Mais detalhes da vaga (opcional): perfil, remuneração e requisitos</summary>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:8px 0;"><input id="rs_req_confidencial" type="checkbox"> Vaga confidencial (não exibir nome do cargo/empresa externamente)</label>

          <h4 style="font-size:13px;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:12px;">Perfil desejado para a vaga</h4>
          <div class="grid3">
            <div class="field"><label>Nível de maturidade</label>
              <select id="rs_req_nivel"><option value="Júnior">Júnior</option><option value="Pleno">Pleno</option><option value="Sênior">Sênior</option></select>
            </div>
            <div class="field"><label>Perfil DISC desejado</label><input id="rs_req_disc" type="text" placeholder="Ex: Dominância e Influência"></div>
            <div class="field"><label>Outro teste de personalidade <small>(GALT, Enneagrama, etc.)</small></label><input id="rs_req_personalidade" type="text"></div>
          </div>
          <div class="grid2">
            <div class="field"><label>Hard skills necessárias</label><textarea id="rs_req_hard" rows="2"></textarea></div>
            <div class="field"><label>Soft skills necessárias</label><textarea id="rs_req_soft" rows="2"></textarea></div>
          </div>
          <div class="field"><label>Principais atividades do colaborador</label><textarea id="rs_req_atividades" rows="2"></textarea></div>

          <h4 style="font-size:13px;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:12px;">Remuneração e formato</h4>
          <div class="grid3">
            <div class="field"><label>Salário fixo</label><input id="rs_req_salario" type="text" placeholder="R$"></div>
            <div class="field"><label>Remuneração variável</label><input id="rs_req_variavel" type="text" placeholder="Ex: comissão, PLR"></div>
            <div class="field"><label>Formato de contratação</label>
              <select id="rs_req_formato"><option>CLT</option><option>PJ</option><option>Estágio</option><option>Jovem Aprendiz</option><option>Temporário</option><option>Freelancer</option></select>
            </div>
          </div>
          <div class="grid3">
            <div class="field"><label>Disponibilidade de horários</label>
              <select id="rs_req_disponibilidade"><option value="comercial">Horário comercial</option><option value="turnos">Turnos</option><option value="flexivel">Flexível</option><option value="fins_de_semana">Inclui finais de semana</option></select>
            </div>
            <div class="field"><label>Interno e/ou externo</label>
              <select id="rs_req_local_tipo"><option>Interna</option><option>Externa</option><option>Híbrida</option></select>
            </div>
            <div class="field"><label>Cidade</label><input id="rs_req_cidade" type="text"></div>
          </div>
          <div class="field"><label>Experiência anterior necessária</label><input id="rs_req_experiencia" type="text"></div>

          <h4 style="font-size:13px;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:12px;">Requisitos técnicos</h4>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:6px;"><input id="rs_req_moto" type="checkbox"> Possuir moto</label>
            <label style="display:flex;align-items:center;gap:6px;"><input id="rs_req_notebook" type="checkbox"> Possuir notebook</label>
            <label style="display:flex;align-items:center;gap:6px;"><input id="rs_req_smartphone" type="checkbox"> Possuir smartphone</label>
          </div>
          <div class="grid3">
            <div class="field"><label>Intimidade com tecnologia</label>
              <select id="rs_req_tecnologia"><option value="basico">Básica</option><option value="intermediario">Intermediária</option><option value="avancado">Avançada</option></select>
            </div>
            <div class="field"><label>Formação superior necessária</label>
              <select id="rs_req_formacao"><option value="nao_exigido">Não exigida</option><option value="cursando">Cursando</option><option value="completo">Completa</option></select>
            </div>
          </div>
          <div class="grid3">
            <div class="field"><label>Excel necessário</label><select id="rs_req_excel"><option value="nao_exigido">Não exigido</option><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></div>
            <div class="field"><label>Word necessário</label><select id="rs_req_word"><option value="nao_exigido">Não exigido</option><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></div>
            <div class="field"><label>PowerPoint necessário</label><select id="rs_req_powerpoint"><option value="nao_exigido">Não exigido</option><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></div>
          </div>

          </details>
          <details style="margin:10px 0;"><summary style="cursor:pointer;font-weight:600;font-size:13px;">Ajustar as etapas deste processo</summary>
          <h4 style="font-size:13px;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:12px;">Etapas do processo seletivo desta vaga</h4>
          <p class="small-muted" style="margin:0 0 8px;">"Nova candidatura", "Proposta" e "Aprovado" valem para toda vaga. Desmarque as etapas que esta vaga não usa (dá para mudar depois).</p>
          ${etapasCheckboxesHtml(null, 'rs-req-etapa')}
          </details>
          <button class="btn btn-primary" onclick="criarRequisicaoRS()">Enviar para aprovação</button>
          <button class="btn btn-ghost" onclick="_rsNovaRequisicaoAberta=false;render();">Cancelar</button>
        </div>`
          : ''
      }

      ${
        state.rs.requisicoes.length
          ? `<table style="margin-top:14px;"><thead><tr><th>Código</th><th>Cargo</th><th>Qtd.</th><th>Status</th><th></th></tr></thead><tbody>
            ${state.rs.requisicoes
              .slice()
              .sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
              .map((r) => {
                const cargo = state.cargos.find((c) => c.id === r.cargoId);
                const pill = _rsStatusRequisicaoPill(r);
                const candidatosDaVaga = state.rs.candidatos.filter((c) => c.vagaId === r.id);
                return `<tr>
                <td><b>${escaparHtml(r.codigo)}</b></td>
                <td class="small-muted">${escaparHtml(cargo?.nome || '—')}</td>
                <td class="small-muted">${r.quantidade}</td>
                <td><span class="pill ${pill.classe}">${pill.label}</span></td>
                <td style="text-align:right;white-space:nowrap;">
                  ${
                    r.status === 'pendente' && souGestor
                      ? `<button class="btn btn-sm btn-primary" onclick="decidirRequisicaoRS('${r.id}',true)">Aprovar</button><button class="btn btn-sm btn-ghost" onclick="decidirRequisicaoRS('${r.id}',false)">Reprovar</button>`
                      : ''
                  }
                  ${r.status === 'aprovada' && !r.publicada ? `<button class="btn btn-sm btn-primary" onclick="abrirConfigurarPaginaPublicaRS('${r.id}')">Publicar</button>` : ''}
                  ${r.publicada && !r.encerrada ? `<button class="btn btn-sm btn-ghost" onclick="encerrarVagaRS('${r.id}')">Encerrar</button>` : ''}
                  ${
                    r.publicada
                      ? `<button class="btn btn-sm btn-ghost" onclick="selecionarVagaRS('${r.id}')">Abrir quadro (${candidatosDaVaga.length})</button>`
                      : ''
                  }
                </td>
              </tr>
              ${
                r.publicada && !r.encerrada && r.vagaPublicaId
                  ? `<tr><td colspan="5" class="small-muted" style="padding-top:0;">🔗 Link público: <code style="font-size:11px;">${linkPublicoRS(r)}</code> <button class="btn btn-ghost btn-sm" onclick="copiarLinkPublicoRS('${r.id}')">Copiar</button></td></tr>`
                  : ''
              }
              ${
                _rsConfigurarPublicaAberta === r.id
                  ? `<tr><td colspan="5">
                <div class="card" style="background:var(--surface-2);margin-top:0;">
                  <h3 style="font-size:14px;">Configurar página pública — ${escaparHtml(r.codigo)}</h3>
                  <div class="notice info" style="font-size:12.5px;margin-bottom:10px;">Descrição, requisitos e cidade já vêm do perfil preenchido na requisição — não precisa digitar de novo.</div>
                  <div class="field"><label>Título da vaga (como candidatos verão)</label><input id="rs_pub_titulo" type="text" value="${escaparHtml(cargo?.nome || '')}"></div>
                  <div class="grid2">
                    <div class="field"><label>Modalidade</label>
                      <select id="rs_pub_modalidade"><option value="Presencial">Presencial</option><option value="Híbrido">Híbrido</option><option value="Remoto">Remoto</option></select>
                    </div>
                    <div class="field"><label>Cidade <small>(vem da requisição)</small></label><input type="text" value="${escaparHtml(r.perfilDesejado?.cidade || '')}" disabled></div>
                  </div>
                  <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:6px 0;"><input id="rs_pub_mostrar_salario" type="checkbox" ${r.perfilDesejado?.salarioFixo ? 'checked' : ''}> Mostrar faixa salarial na página pública</label>
                  <div class="field"><label>Faixa salarial <small>(só aparece se marcado acima)</small></label><input id="rs_pub_faixa" type="text" placeholder="Ex: R$ 2.500 a R$ 3.200" value="${escaparHtml(r.perfilDesejado?.salarioFixo || '')}"></div>
                  <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:6px 0;"><input id="rs_pub_mostrar_empresa" type="checkbox" checked> Mostrar o nome da empresa (desmarque para vaga confidencial)</label>
                  <button class="btn btn-primary btn-sm" onclick="publicarVagaRS('${r.id}')">Publicar vaga</button>
                  <button class="btn btn-ghost btn-sm" onclick="_rsConfigurarPublicaAberta=null;render();">Cancelar</button>
                </div>
              </td></tr>`
                  : ''
              }
              `;
              })
              .join('')}
          </tbody></table>`
          : '<div class="empty" style="margin-top:10px;">Nenhuma requisição criada ainda.</div>'
      }
    </div>
  `;
}

let _rsCandidaturasPendentes = {}; // vagaId -> array | undefined (ainda não carregou)
let _rsCandidaturasCarregando = {};

async function carregarCandidaturasPendentesRS(vaga) {
  _rsCandidaturasCarregando[vaga.id] = true;
  const { data, error } = await sb.functions.invoke('rs', {
    body: { action: 'listar_candidaturas_pendentes', requisicaoId: vaga.id },
  });
  _rsCandidaturasCarregando[vaga.id] = false;
  if (!error && data && !data.error) _rsCandidaturasPendentes[vaga.id] = data.candidaturas || [];
  render();
}

async function importarCandidaturaRS(candidaturaId, vagaId) {
  const { data, error } = await sb.functions.invoke('rs', { body: { action: 'importar_candidatura', candidaturaId } });
  if (error || data?.error) {
    showToast((data && data.error) || 'Não foi possível importar.');
    return;
  }
  const c = data.candidato;
  state.rs.candidatos.push({
    id: uid(),
    vagaId,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    origem: 'Página pública',
    curriculo: '',
    perfil: c.perfil || null,
    etapa: 'nova',
    reprovado: false,
    historico: [
      {
        de: null,
        para: 'nova',
        autorId: meuPerfilId,
        em: new Date().toISOString(),
        observacao: 'Candidatura recebida pela página pública',
      },
    ],
    ...novoCarimbo(),
  });
  await carregarCandidaturasPendentesRS(state.rs.requisicoes.find((r) => r.id === vagaId));
  showToast(`"${c.nome}" importado(a) para o pipeline.`);
}

function renderPipelineCandidatosRS(vaga) {
  if (_rsCandidaturasPendentes[vaga.id] === undefined && !_rsCandidaturasCarregando[vaga.id]) {
    carregarCandidaturasPendentesRS(vaga);
  }
  const pendentes = _rsCandidaturasPendentes[vaga.id] || [];

  return `
    <div class="card" style="background:var(--surface-2);margin-top:8px;">
      ${
        pendentes.length
          ? `<div class="notice info" style="margin-bottom:12px;">📥 <b>${pendentes.length} candidatura(s) nova(s)</b> recebida(s) pela página pública, aguardando importar pro pipeline:
        ${pendentes
          .map(
            (
              p
            ) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line);">
          <span>${escaparHtml(p.nome)} <span class="small-muted">(${escaparHtml(p.email)})</span>${p.curriculoUrl ? ` · <a href="${p.curriculoUrl}" target="_blank" rel="noopener">ver currículo</a>` : ''}</span>
          <button class="btn btn-sm btn-primary" onclick="importarCandidaturaRS('${p.id}','${vaga.id}')">Importar</button>
        </div>`
          )
          .join('')}
      </div>`
          : ''
      }
      ${quadroDaVagaHtml(vaga)}
      <details style="margin-top:14px;" ${_rsOrientacoesVagaAberta === vaga.id ? 'open' : ''}>
        <summary style="cursor:pointer;font-weight:600;font-size:13px;">Configurar esta vaga (etapas, orientações e prova prática) ${situacaoProvaPraticaRS(vaga) === 'pendente' ? '<span class="pill pill-desenvolver">prova prática pendente</span>' : ''}</summary>
        <div style="margin-top:10px;">${etapasVagaEditorHtml(vaga)}${etapasVagaOrientacoesHtml(vaga)}</div>
      </details>
    </div>`;
}
