/* =========================================================
   R&S — AGENDA DAS ENTREVISTAS
   -----------------------------------------------------------
   Marcar a entrevista de um candidato (data, hora, duração, fuso, formato, local ou link, entrevistador) e acompanhar o que vem
   por aí. Cada entrevista é um ITEM da lista state.rs.entrevistas (com id): assim, se duas pessoas agendam ao mesmo tempo, as
   duas entrevistas sobrevivem (o salvamento seguro mescla item a item).

   O que o sistema faz:
     - na FICHA do candidato: agendar, remarcar, cancelar, marcar como realizada ou "faltou", reenviar o e-mail, baixar o arquivo
       .ics para o calendário de quem organiza;
     - o CANDIDATO recebe um e-mail com data, hora, formato e local (ou link) e dois botões para pôr no calendário (Google Agenda e
       Outlook). O e-mail nunca inventa nada: só mostra o que o RH preencheu;
     - a página R&S — AGENDA: o que é hoje, os próximos 30 dias, as entrevistas que já passaram e esperam um resultado, e quem está
       em etapa de entrevista sem data marcada; mais um arquivo .ics com a agenda toda;
     - o painel "o que fazer hoje" avisa de entrevistas hoje, para atualizar e sem data.
   Avisa (sem impedir) quando a mesma pessoa, ou o mesmo entrevistador, tem outra entrevista no mesmo horário.

   Limites declarados: o lembrete é manual (botão), porque o servidor não grava no documento da empresa; o e-mail leva links de
   calendário, não anexo .ics; os horários são de relógio de parede num fuso escolhido (Brasília por padrão).

   O começo do arquivo são funções PURAS (a data de hoje entra como parâmetro), testadas.
   ========================================================= */

const ENTREVISTA_ETAPAS_RS = ['entrevista_fit', 'entrevista_final'];
const ENTREVISTA_FORMATOS_RS = { presencial: 'Presencial', online: 'Online (vídeo)', telefone: 'Telefone' };
const ENTREVISTA_FUSOS_RS = [
  { id: '-03:00', nome: 'Brasília (UTC-3)', curto: 'horário de Brasília' },
  { id: '-04:00', nome: 'Manaus (UTC-4)', curto: 'horário de Manaus' },
  { id: '-05:00', nome: 'Rio Branco (UTC-5)', curto: 'horário do Acre' },
  { id: '-02:00', nome: 'Fernando de Noronha (UTC-2)', curto: 'horário de Fernando de Noronha' },
];
const ENTREVISTA_DURACOES_RS = [30, 45, 60, 90, 120];
const ENTREVISTA_STATUS_RS = {
  agendada: { texto: 'Agendada', classe: 'pill-desenvolver' },
  realizada: { texto: 'Realizada', classe: 'pill-alavancar' },
  faltou: { texto: 'Faltou', classe: 'pill-iniciar' },
  cancelada: { texto: 'Cancelada', classe: 'pill-neutral' },
};
const AGENDA_DIAS_A_FRENTE_RS = 30;
const DIA_MS_AGENDA_RS = 86400000;
const DIAS_SEMANA_RS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];
const MESES_RS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// ---------- data e hora ----------
function dataValidaAgendaRS(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
function horaValidaAgendaRS(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
}
function fusoDaEntrevistaRS(e) {
  return ENTREVISTA_FUSOS_RS.find((f) => f.id === e.fuso) || ENTREVISTA_FUSOS_RS[0];
}
// O instante (em milissegundos) em que a entrevista começa: a hora de parede no fuso escolhido.
function inicioEntrevistaMsRS(e) {
  return Date.parse(`${e.data}T${e.hora}:00${fusoDaEntrevistaRS(e).id}`);
}
function fimEntrevistaMsRS(e) {
  return inicioEntrevistaMsRS(e) + (Number(e.duracaoMin) || 45) * 60000;
}
// "quinta-feira, 12 de novembro de 2026, às 14:00 (horário de Brasília)". O dia da semana sai da própria data (sem depender
// do fuso do computador de quem olha).
function rotuloQuandoRS(e) {
  const [a, m, d] = e.data.split('-').map(Number);
  const dia = DIAS_SEMANA_RS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia}, ${d} de ${MESES_RS[m - 1]} de ${a}, às ${e.hora} (${fusoDaEntrevistaRS(e).curto})`;
}
function rotuloCurtoQuandoRS(e) {
  const [a, m, d] = e.data.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} às ${e.hora}`;
}

// ---------- validação ----------
// campos: { etapa, data, hora, duracaoMin, fuso, formato, local, entrevistador, observacao }. agora: milissegundos.
// Devolve { ok, erro } ou { ok, entrevista } já limpa. permitirPassado: para registrar uma entrevista que já aconteceu.
function validarEntrevistaRS(campos, { agora, etapasPermitidas, permitirPassado }) {
  const c = campos || {};
  const erro = (texto) => ({ ok: false, erro: texto });
  const etapa = String(c.etapa || '');
  if (!(etapasPermitidas || ENTREVISTA_ETAPAS_RS).includes(etapa)) return erro('Escolha a etapa da entrevista.');
  if (!dataValidaAgendaRS(c.data)) return erro('Informe uma data válida.');
  if (!horaValidaAgendaRS(c.hora)) return erro('Informe uma hora válida (por exemplo, 14:30).');
  const duracaoMin = ENTREVISTA_DURACOES_RS.includes(Number(c.duracaoMin)) ? Number(c.duracaoMin) : 45;
  const fuso = ENTREVISTA_FUSOS_RS.some((f) => f.id === c.fuso) ? c.fuso : ENTREVISTA_FUSOS_RS[0].id;
  const formato = String(c.formato || '');
  if (!ENTREVISTA_FORMATOS_RS[formato]) return erro('Escolha o formato da entrevista.');
  const local = String(c.local || '')
    .trim()
    .slice(0, 300);
  if (formato === 'online' && !/^https?:\/\/[^\s]+$/i.test(local))
    return erro('Informe o link da reunião (começa com https://).');
  if (formato === 'presencial' && local.length < 3) return erro('Informe o endereço ou a sala da entrevista.');
  const entrevista = {
    etapa,
    data: c.data,
    hora: c.hora,
    duracaoMin,
    fuso,
    formato,
    local,
    entrevistador: String(c.entrevistador || '')
      .trim()
      .slice(0, 80),
    observacao: String(c.observacao || '')
      .trim()
      .slice(0, 300),
  };
  if (!permitirPassado && inicioEntrevistaMsRS(entrevista) < agora)
    return erro('A data e a hora precisam estar no futuro.');
  return { ok: true, entrevista };
}

// ---------- conflitos (só avisam, não impedem) ----------
function normalizarNomeAgendaRS(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
// Outras entrevistas AGENDADAS no mesmo horário: do mesmo candidato ou do mesmo entrevistador.
function conflitosEntrevistaRS(nova, candidatoId, entrevistas, ignorarId) {
  const ini = inicioEntrevistaMsRS(nova);
  const fim = fimEntrevistaMsRS(nova);
  const entrevistador = normalizarNomeAgendaRS(nova.entrevistador);
  const conflitos = [];
  for (const o of entrevistas || []) {
    if (o.id === ignorarId || o.status !== 'agendada') continue;
    if (!(ini < fimEntrevistaMsRS(o) && inicioEntrevistaMsRS(o) < fim)) continue; // encostar (uma acaba quando a outra começa) não conflita
    if (o.candidatoId === candidatoId)
      conflitos.push({ tipo: 'candidato', entrevistaId: o.id, quando: rotuloCurtoQuandoRS(o) });
    else if (entrevistador && normalizarNomeAgendaRS(o.entrevistador) === entrevistador)
      conflitos.push({
        tipo: 'entrevistador',
        entrevistaId: o.id,
        candidatoId: o.candidatoId,
        quando: rotuloCurtoQuandoRS(o),
      });
  }
  return conflitos;
}

// ---------- arquivo .ics e links de calendário ----------
function icsEscaparRS(t) {
  return String(t == null ? '' : t)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
// Linhas de até 75 bytes (UTF-8); a continuação começa com um espaço. Não parte um caractere no meio.
function icsDobrarRS(linha) {
  const enc = new TextEncoder();
  const partes = [];
  let atual = '';
  let bytes = 0;
  let limite = 75;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = ' ';
      bytes = 1;
      limite = 75;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join('\r\n');
}
function icsUtcRS(ms) {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}
function descricaoEntrevistaRS(e, extra) {
  const linhas = [`Formato: ${ENTREVISTA_FORMATOS_RS[e.formato]}`];
  if (e.local) linhas.push(`${e.formato === 'online' ? 'Link' : 'Local'}: ${e.local}`);
  if (e.entrevistador) linhas.push(`Com: ${e.entrevistador}`);
  if (e.observacao) linhas.push(e.observacao);
  if (extra) linhas.push(extra);
  return linhas.join('\n');
}
// eventos: [{ entrevista, titulo, descricaoExtra }]
function gerarIcsRS(eventos, agora) {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//INETRIS//NORTE//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of eventos) {
    const e = ev.entrevista;
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@inetris.com.br`,
      `DTSTAMP:${icsUtcRS(agora)}`,
      `DTSTART:${icsUtcRS(inicioEntrevistaMsRS(e))}`,
      `DTEND:${icsUtcRS(fimEntrevistaMsRS(e))}`,
      `SUMMARY:${icsEscaparRS(ev.titulo)}`
    );
    if (e.local) linhas.push(`LOCATION:${icsEscaparRS(e.local)}`);
    linhas.push(
      `DESCRIPTION:${icsEscaparRS(descricaoEntrevistaRS(e, ev.descricaoExtra))}`,
      `STATUS:${e.status === 'cancelada' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
  }
  linhas.push('END:VCALENDAR');
  return `${linhas.map(icsDobrarRS).join('\r\n')}\r\n`;
}
function linkGoogleAgendaRS({ titulo, inicioMs, fimMs, detalhes, local }) {
  const q = (t) => encodeURIComponent(t);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${q(titulo)}&dates=${icsUtcRS(inicioMs)}/${icsUtcRS(fimMs)}&details=${q(detalhes)}&location=${q(local || '')}`;
}
function linkOutlookAgendaRS({ titulo, inicioMs, fimMs, detalhes, local }) {
  const q = (t) => encodeURIComponent(t);
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${q(titulo)}&startdt=${q(iso(inicioMs))}&enddt=${q(iso(fimMs))}&body=${q(detalhes)}&location=${q(local || '')}`;
}

// ---------- o e-mail do candidato ----------
// tipo: 'agendada' | 'remarcada' | 'cancelada' | 'lembrete'. anterior: a entrevista antes de remarcar. Só mostra o que o RH preencheu.
function montarEmailEntrevistaRS({ tipo, nome, nomeVaga, entrevista, anterior }) {
  const e = escaparHtml;
  const ent = entrevista;
  const assuntos = {
    agendada: `Entrevista agendada: ${nomeVaga}`,
    remarcada: `Horário da entrevista alterado: ${nomeVaga}`,
    cancelada: `Entrevista cancelada: ${nomeVaga}`,
    lembrete: `Lembrete da sua entrevista: ${nomeVaga}`,
  };
  const abertura = {
    agendada: `Sua entrevista para a vaga <b>${e(nomeVaga)}</b> está agendada.`,
    remarcada: `O horário da sua entrevista para a vaga <b>${e(nomeVaga)}</b> mudou.${anterior ? ` Antes: <s>${e(rotuloQuandoRS(anterior))}</s>.` : ''}`,
    cancelada: `Sua entrevista para a vaga <b>${e(nomeVaga)}</b>, marcada para <b>${e(rotuloQuandoRS(ent))}</b>, foi cancelada. Se houver um novo horário, você receberá um novo e-mail.`,
    lembrete: `Lembrando da sua entrevista para a vaga <b>${e(nomeVaga)}</b>.`,
  }[tipo];
  if (!abertura) return null;
  let corpoHtml = `<p>Olá, ${e(nome)}!</p><p>${abertura}</p>`;
  if (tipo !== 'cancelada') {
    const linha = (rotulo, valor) =>
      `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;"><b>${rotulo}</b></td><td style="padding:4px 0;">${valor}</td></tr>`;
    const url = /^https?:\/\/[^\s]+$/i.test(ent.local) ? ent.local : null;
    let onde = e(ENTREVISTA_FORMATOS_RS[ent.formato]);
    if (ent.formato === 'online' && url)
      onde += ` — <a href="${e(url)}">Entrar na reunião</a><br><span style="font-size:12px;">${e(url)}</span>`;
    else if (ent.formato === 'presencial') onde += ` — ${e(ent.local)}`;
    else if (ent.formato === 'telefone')
      onde += ent.local ? ` — ${e(ent.local)}` : ' — a equipe vai ligar para o telefone do seu cadastro';
    corpoHtml += `<table role="presentation" style="border-collapse:collapse;font-size:14px;">${linha('Quando', e(rotuloQuandoRS(ent)))}${linha('Duração', `cerca de ${ent.duracaoMin} minutos`)}${linha('Formato', onde)}${ent.entrevistador ? linha('Com', e(ent.entrevistador)) : ''}</table>`;
    if (ent.observacao) corpoHtml += `<p style="white-space:pre-wrap;">${e(ent.observacao)}</p>`;
    const detalhes = descricaoEntrevistaRS(ent);
    const dados = {
      titulo: `Entrevista — ${nomeVaga}`,
      inicioMs: inicioEntrevistaMsRS(ent),
      fimMs: fimEntrevistaMsRS(ent),
      detalhes,
      local: ent.local,
    };
    corpoHtml += `<p>Adicione ao seu calendário: <a href="${e(linkGoogleAgendaRS(dados))}">Google Agenda</a> · <a href="${e(linkOutlookAgendaRS(dados))}">Outlook</a></p>`;
    corpoHtml += '<p>Se não puder comparecer, avise a equipe da empresa com antecedência.</p>';
  }
  return { assunto: assuntos[tipo], corpoHtml };
}

// ---------- a agenda (tudo calculado, sem tela) ----------
// Devolve as entrevistas de hoje, as próximas, as que já passaram sem resultado e quem está em etapa de entrevista sem data.
function montarAgendaRS({ entrevistas, candidatos, requisicoes, agora, hojeISO, vagaId, dias }) {
  const candidatoPorId = new Map((candidatos || []).map((c) => [c.id, c]));
  const vagaAberta = (id) => (requisicoes || []).some((r) => r.id === id && r.status === 'aprovada' && !r.encerrada);
  const validas = (entrevistas || [])
    .filter((e) => {
      const c = candidatoPorId.get(e.candidatoId);
      return (
        c &&
        !c.reprovado &&
        (!vagaId || c.vagaId === vagaId) &&
        dataValidaAgendaRS(e.data) &&
        horaValidaAgendaRS(e.hora)
      );
    })
    .map((e) => ({ ...e, candidato: candidatoPorId.get(e.candidatoId) }));
  const agendadas = validas
    .filter((e) => e.status === 'agendada')
    .sort((a, b) => inicioEntrevistaMsRS(a) - inicioEntrevistaMsRS(b));
  const limite = agora + (dias || AGENDA_DIAS_A_FRENTE_RS) * DIA_MS_AGENDA_RS;
  const paraAtualizar = agendadas.filter((e) => fimEntrevistaMsRS(e) < agora);
  const futuras = agendadas.filter((e) => fimEntrevistaMsRS(e) >= agora && inicioEntrevistaMsRS(e) <= limite);
  const hoje = agendadas.filter((e) => e.data === hojeISO && fimEntrevistaMsRS(e) >= agora);
  const porDia = [];
  for (const e of futuras) {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.data === e.data) ultimo.itens.push(e);
    else porDia.push({ data: e.data, itens: [e] });
  }
  // Já tem entrevista marcada ou já fez: não precisa de data. Quem faltou ou teve a entrevista cancelada continua precisando.
  const comEntrevista = new Set(
    validas.filter((e) => e.status === 'agendada' || e.status === 'realizada').map((e) => `${e.candidatoId}|${e.etapa}`)
  );
  const semData = (candidatos || []).filter(
    (c) =>
      c.vagaId &&
      !c.reprovado &&
      !c.convertidoEm &&
      (!vagaId || c.vagaId === vagaId) &&
      vagaAberta(c.vagaId) &&
      ENTREVISTA_ETAPAS_RS.includes(c.etapa) &&
      !comEntrevista.has(`${c.id}|${c.etapa}`)
  );
  return { hoje, porDia, paraAtualizar, semData, total: futuras.length };
}

// ---------- o que o painel "para você fazer agora" mostra ----------
function acoesAgendaRS({ entrevistas, candidatos, requisicoes, agora, hojeISO }) {
  const a = montarAgendaRS({
    entrevistas,
    candidatos,
    requisicoes,
    agora: agora || Date.now(),
    hojeISO: hojeISO || hojeLocalISO(),
  });
  const acoes = [];
  if (a.hoje.length)
    acoes.push({
      chave: 'entrevistas_hoje',
      total: a.hoje.length,
      texto: `${a.hoje.length} entrevista(s) hoje`,
      vagaId: null,
    });
  if (a.paraAtualizar.length)
    acoes.push({
      chave: 'entrevistas_atualizar',
      total: a.paraAtualizar.length,
      texto: `${a.paraAtualizar.length} entrevista(s) já passaram: registre o resultado`,
      vagaId: null,
    });
  if (a.semData.length)
    acoes.push({
      chave: 'sem_entrevista',
      total: a.semData.length,
      texto: `${a.semData.length} candidato(s) em entrevista sem data marcada`,
      vagaId: a.semData[0].vagaId,
    });
  return acoes;
}

// ---------- estado e ações ----------
let _rsAgendaForm = null; // { candidatoId, entrevistaId, valores, erro, conflitos }
let _rsAgendaFiltro = { vagaId: '' };

function agendaGestorRS() {
  return ['owner', 'rh'].includes(meuPapelReal);
}
function garantirEntrevistasRS() {
  garantirRS();
  if (!Array.isArray(state.rs.entrevistas)) state.rs.entrevistas = [];
  return state.rs.entrevistas;
}
function entrevistasDoCandidatoRS(candidatoId) {
  return garantirEntrevistasRS()
    .filter((e) => e.candidatoId === candidatoId)
    .sort((a, b) => inicioEntrevistaMsRS(a) - inicioEntrevistaMsRS(b));
}
function nomeDaVagaDoCandidatoRS(c) {
  const vaga = state.rs.requisicoes.find((r) => r.id === c.vagaId);
  return vaga ? state.cargos.find((k) => k.id === vaga.cargoId)?.nome || vaga.codigo : 'nossa vaga';
}

// Devolve true (saiu), false (falhou) ou null (o candidato não tem e-mail).
async function enviarEmailEntrevistaRS(candidato, tipo, entrevista, anterior) {
  if (!candidato.email) return null;
  const email = montarEmailEntrevistaRS({
    tipo,
    nome: candidato.nome,
    nomeVaga: nomeDaVagaDoCandidatoRS(candidato),
    entrevista,
    anterior,
  });
  if (!email) return null;
  try {
    const { data, error } = await sb.functions.invoke('enviar-email', {
      body: { destinatario: candidato.email, assunto: email.assunto, corpoHtml: email.corpoHtml },
    });
    if (error || (data && data.error)) {
      console.warn('Falha ao enviar o e-mail da entrevista', error || data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Falha ao enviar o e-mail da entrevista', e);
    return false;
  }
}

function etapasDeEntrevistaDaVagaRS(vaga) {
  return etapasAtivasDaVagaRS(vaga)
    .map((e) => e.id)
    .filter((id) => ENTREVISTA_ETAPAS_RS.includes(id));
}

// O núcleo de agendar/remarcar (sem tela). Devolve { ok, erro } | { ok:false, conflitos, precisaConfirmar } | { ok:true, entrevista, email }.
async function salvarEntrevistaRS(candidatoId, campos, { entrevistaId, enviarEmail, confirmouConflito, agora } = {}) {
  if (!agendaGestorRS()) return { ok: false, erro: 'Só o Administrador e o RH agendam entrevistas.' };
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand || cand.reprovado) return { ok: false, erro: 'Este candidato não está mais no processo.' };
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const lista = garantirEntrevistasRS();
  const existente = entrevistaId ? lista.find((e) => e.id === entrevistaId) : null;
  if (entrevistaId && !existente) return { ok: false, erro: 'Essa entrevista não existe mais.' };
  const v = validarEntrevistaRS(campos, {
    agora: agora || Date.now(),
    etapasPermitidas: etapasDeEntrevistaDaVagaRS(vaga),
    permitirPassado: false,
  });
  if (!v.ok) return v;
  const conflitos = conflitosEntrevistaRS(v.entrevista, candidatoId, lista, entrevistaId);
  if (conflitos.length && !confirmouConflito) return { ok: false, conflitos, precisaConfirmar: true };
  const anterior = existente ? { ...existente } : null;
  let entrevista;
  if (existente) {
    Object.assign(existente, v.entrevista, {
      status: 'agendada',
      atualizadoPor: meuPerfilId,
      atualizadoEm: new Date().toISOString(),
    });
    entrevista = existente;
  } else {
    entrevista = {
      id: uid(),
      candidatoId,
      ...v.entrevista,
      status: 'agendada',
      emailEnviadoEm: null,
      ...novoCarimbo(),
    };
    lista.push(entrevista);
  }
  let email = null;
  if (enviarEmail) {
    email = await enviarEmailEntrevistaRS(cand, anterior ? 'remarcada' : 'agendada', entrevista, anterior);
    if (email === true) entrevista.emailEnviadoEm = new Date().toISOString();
  }
  registrarAuditoria(anterior ? 'rs.entrevista_remarcada' : 'rs.entrevista_agendada', {
    vagaId: cand.vagaId,
    etapa: entrevista.etapa,
    emailEnviado: email === true,
  });
  return { ok: true, entrevista, email };
}

function lerFormularioEntrevistaRS() {
  const v = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const email = document.getElementById('rs_ent_email');
  return {
    campos: {
      etapa: v('rs_ent_etapa'),
      data: v('rs_ent_data'),
      hora: v('rs_ent_hora'),
      duracaoMin: v('rs_ent_duracao'),
      fuso: v('rs_ent_fuso'),
      formato: v('rs_ent_formato'),
      local: v('rs_ent_local'),
      entrevistador: v('rs_ent_entrevistador'),
      observacao: v('rs_ent_obs'),
    },
    enviarEmail: !!(email && email.checked),
  };
}

function abrirFormularioEntrevistaRS(candidatoId, entrevistaId) {
  if (!agendaGestorRS()) return;
  const cand = state.rs.candidatos.find((c) => c.id === candidatoId);
  if (!cand) return;
  const vaga = state.rs.requisicoes.find((r) => r.id === cand.vagaId);
  const existente = entrevistaId ? garantirEntrevistasRS().find((e) => e.id === entrevistaId) : null;
  const etapas = etapasDeEntrevistaDaVagaRS(vaga);
  _rsAgendaForm = {
    candidatoId,
    entrevistaId: existente ? existente.id : null,
    valores: existente
      ? { ...existente, enviarEmail: !!cand.email }
      : {
          etapa: etapas.includes(cand.etapa) ? cand.etapa : etapas[0] || '',
          data: '',
          hora: '',
          duracaoMin: 45,
          fuso: ENTREVISTA_FUSOS_RS[0].id,
          formato: 'online',
          local: '',
          entrevistador: '',
          observacao: '',
          enviarEmail: !!cand.email,
        },
    erro: null,
    conflitos: [],
  };
  _psFichaAberta = candidatoId;
  render();
}
function fecharFormularioEntrevistaRS() {
  _rsAgendaForm = null;
  render();
}
async function salvarFormularioEntrevistaRS(confirmouConflito) {
  const form = _rsAgendaForm;
  if (!form) return;
  const { campos, enviarEmail } = lerFormularioEntrevistaRS();
  form.valores = { ...campos, enviarEmail };
  const r = await salvarEntrevistaRS(form.candidatoId, campos, {
    entrevistaId: form.entrevistaId,
    enviarEmail,
    confirmouConflito: !!confirmouConflito,
  });
  if (!r.ok) {
    form.erro = r.precisaConfirmar ? null : r.erro;
    form.conflitos = r.conflitos || [];
    render();
    return;
  }
  _rsAgendaForm = null;
  showToast(
    r.email === false
      ? 'Entrevista agendada, mas o e-mail ao candidato não saiu. Use "Reenviar e-mail".'
      : r.email === true
        ? 'Entrevista agendada e e-mail enviado.'
        : 'Entrevista agendada.'
  );
  render();
}

function entrevistaPorIdRS(id) {
  return garantirEntrevistasRS().find((e) => e.id === id) || null;
}
function mudarResultadoEntrevistaRS(id, status) {
  if (!agendaGestorRS() || !['realizada', 'faltou'].includes(status)) return;
  const e = entrevistaPorIdRS(id);
  if (!e || e.status !== 'agendada') return;
  e.status = status;
  e.atualizadoPor = meuPerfilId;
  e.atualizadoEm = new Date().toISOString();
  const cand = state.rs.candidatos.find((c) => c.id === e.candidatoId);
  registrarAuditoria('rs.entrevista_resultado', { vagaId: cand ? cand.vagaId : null, status });
  showToast(status === 'realizada' ? 'Entrevista marcada como realizada.' : 'Marcado: o candidato faltou.');
  render();
}
async function cancelarEntrevistaRS(id) {
  if (!agendaGestorRS()) return;
  const e = entrevistaPorIdRS(id);
  if (!e || e.status !== 'agendada') return;
  const cand = state.rs.candidatos.find((c) => c.id === e.candidatoId);
  const avisar = !!(cand && cand.email && e.emailEnviadoEm);
  if (!confirm(avisar ? 'Cancelar esta entrevista? O candidato será avisado por e-mail.' : 'Cancelar esta entrevista?'))
    return;
  e.status = 'cancelada';
  e.atualizadoPor = meuPerfilId;
  e.atualizadoEm = new Date().toISOString();
  let email = null;
  if (avisar) email = await enviarEmailEntrevistaRS(cand, 'cancelada', e);
  registrarAuditoria('rs.entrevista_cancelada', { vagaId: cand ? cand.vagaId : null, emailEnviado: email === true });
  showToast(email === false ? 'Entrevista cancelada, mas o e-mail ao candidato não saiu.' : 'Entrevista cancelada.');
  render();
}
// tipo: 'agendada' (reenviar a confirmação) ou 'lembrete'.
async function reenviarEmailEntrevistaRS(id, tipo) {
  if (!agendaGestorRS()) return;
  const e = entrevistaPorIdRS(id);
  const cand = e && state.rs.candidatos.find((c) => c.id === e.candidatoId);
  if (!e || !cand || e.status !== 'agendada') return;
  const r = await enviarEmailEntrevistaRS(cand, tipo === 'lembrete' ? 'lembrete' : 'agendada', e);
  if (r === true) e.emailEnviadoEm = new Date().toISOString();
  showToast(
    r === true
      ? `E-mail enviado a ${cand.nome}.`
      : r === null
        ? 'Este candidato não tem e-mail cadastrado.'
        : 'O e-mail não saiu. Tente de novo mais tarde.'
  );
  render();
}

function baixarArquivoAgendaRS(nome, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function eventoDoCalendarioRS(e) {
  const cand = state.rs.candidatos.find((c) => c.id === e.candidatoId);
  return {
    entrevista: e,
    titulo: `Entrevista: ${cand ? cand.nome : 'candidato'} — ${cand ? nomeDaVagaDoCandidatoRS(cand) : ''}`,
  };
}
function baixarIcsEntrevistaRS(id) {
  const e = entrevistaPorIdRS(id);
  if (e) baixarArquivoAgendaRS(`entrevista-${e.data}.ics`, gerarIcsRS([eventoDoCalendarioRS(e)], Date.now()));
}
function baixarAgendaIcsRS() {
  const a = montarAgendaRS({
    entrevistas: garantirEntrevistasRS(),
    candidatos: state.rs.candidatos,
    requisicoes: state.rs.requisicoes,
    agora: Date.now(),
    hojeISO: hojeLocalISO(),
    vagaId: _rsAgendaFiltro.vagaId,
  });
  const eventos = [...a.porDia.flatMap((d) => d.itens)].map(eventoDoCalendarioRS);
  if (!eventos.length) return showToast('Não há entrevistas agendadas nos próximos 30 dias.');
  baixarArquivoAgendaRS(`agenda-entrevistas-${hojeLocalISO()}.ics`, gerarIcsRS(eventos, Date.now()));
  registrarAuditoria('rs.agenda_exportada', { entrevistas: eventos.length });
}

function filtrarAgendaRS(vagaId) {
  _rsAgendaFiltro.vagaId = vagaId || '';
  render();
}
function abrirCandidatoDaAgendaRS(candidatoId) {
  const c = state.rs.candidatos.find((x) => x.id === candidatoId);
  if (!c) return;
  _rsRequisicaoExpandida = c.vagaId || null;
  _psFichaAberta = candidatoId;
  goto('rs_processo');
}
// Da agenda direto para o formulário de agendar na ficha do candidato.
function agendarDaAgendaRS(candidatoId) {
  const c = state.rs.candidatos.find((x) => x.id === candidatoId);
  if (!c) return;
  _rsRequisicaoExpandida = c.vagaId || null;
  goto('rs_processo');
  abrirFormularioEntrevistaRS(candidatoId, null);
}

// ---------- a ficha do candidato ----------
function linhaEntrevistaHtml(e, gestor) {
  const x = escaparHtml;
  const id = escaparParaOnclick(e.id);
  const st = ENTREVISTA_STATUS_RS[e.status] || ENTREVISTA_STATUS_RS.agendada;
  const btn = (texto, onclick) => `<button class="btn btn-sm btn-ghost" onclick="${onclick}">${texto}</button>`;
  const acoes =
    gestor && e.status === 'agendada'
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${btn('Remarcar', `abrirFormularioEntrevistaRS('${escaparParaOnclick(e.candidatoId)}', '${id}')`)}${btn('Realizada', `mudarResultadoEntrevistaRS('${id}', 'realizada')`)}${btn('Faltou', `mudarResultadoEntrevistaRS('${id}', 'faltou')`)}${btn('Reenviar e-mail', `reenviarEmailEntrevistaRS('${id}', 'agendada')`)}${btn('Baixar .ics', `baixarIcsEntrevistaRS('${id}')`)}${btn('Cancelar', `cancelarEntrevistaRS('${id}')`)}</div>`
      : '';
  return `<li style="margin:0 0 8px;"><b>${x(etapaNomeRS(e.etapa))}</b> — ${x(rotuloQuandoRS(e))} <span class="pill ${st.classe}">${st.texto}</span>
    <div class="small-muted">${x(ENTREVISTA_FORMATOS_RS[e.formato])}${e.local ? ` · ${x(e.local)}` : ''}${e.entrevistador ? ` · com ${x(e.entrevistador)}` : ''}${e.emailEnviadoEm ? ' · candidato avisado por e-mail' : ''}</div>${acoes}</li>`;
}

function formularioEntrevistaHtml(c, vaga) {
  const form = _rsAgendaForm;
  const x = escaparHtml;
  const v = form.valores;
  const etapas = etapasDeEntrevistaDaVagaRS(vaga);
  const opcoes = (lista, atual, rotulo) =>
    lista
      .map(
        (o) => `<option value="${x(o.id)}" ${String(o.id) === String(atual) ? 'selected' : ''}>${x(rotulo(o))}</option>`
      )
      .join('');
  const campo = (id, rotulo, corpo) =>
    `<div><label for="${id}" class="small-muted" style="display:block;">${rotulo}</label>${corpo}</div>`;
  const conflitos = form.conflitos
    .map((k) => {
      const outro = k.candidatoId ? state.rs.candidatos.find((cc) => cc.id === k.candidatoId) : null;
      return `<li>${k.tipo === 'candidato' ? 'Este candidato já tem outra entrevista' : `${x(outro ? outro.nome : 'Outro candidato')} tem entrevista com o mesmo entrevistador`} em ${x(k.quando)}.</li>`;
    })
    .join('');
  return `<form onsubmit="return false;" style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:8px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;">${form.entrevistaId ? 'Remarcar entrevista' : 'Agendar entrevista'}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
      ${campo(
        'rs_ent_etapa',
        'Etapa',
        `<select id="rs_ent_etapa">${opcoes(
          etapas.map((id) => ({ id })),
          v.etapa,
          (o) => etapaNomeRS(o.id)
        )}</select>`
      )}
      ${campo('rs_ent_data', 'Data', `<input type="date" id="rs_ent_data" value="${x(v.data)}">`)}
      ${campo('rs_ent_hora', 'Hora', `<input type="time" id="rs_ent_hora" value="${x(v.hora)}">`)}
      ${campo(
        'rs_ent_duracao',
        'Duração',
        `<select id="rs_ent_duracao">${opcoes(
          ENTREVISTA_DURACOES_RS.map((id) => ({ id })),
          v.duracaoMin,
          (o) => `${o.id} min`
        )}</select>`
      )}
      ${campo('rs_ent_fuso', 'Fuso', `<select id="rs_ent_fuso">${opcoes(ENTREVISTA_FUSOS_RS, v.fuso, (o) => o.nome)}</select>`)}
      ${campo(
        'rs_ent_formato',
        'Formato',
        `<select id="rs_ent_formato">${opcoes(
          Object.keys(ENTREVISTA_FORMATOS_RS).map((id) => ({ id })),
          v.formato,
          (o) => ENTREVISTA_FORMATOS_RS[o.id]
        )}</select>`
      )}
    </div>
    <div style="display:grid;gap:8px;margin-top:8px;">
      ${campo('rs_ent_local', 'Link da reunião ou local', `<input type="text" id="rs_ent_local" maxlength="300" value="${x(v.local)}" style="width:100%;"><div class="small-muted" style="font-size:12px;">Online: cole o link. Presencial: endereço ou sala. Telefone: opcional.</div>`)}
      ${campo('rs_ent_entrevistador', 'Entrevistador (opcional)', `<input type="text" id="rs_ent_entrevistador" maxlength="80" value="${x(v.entrevistador)}" style="width:100%;">`)}
      ${campo('rs_ent_obs', 'Observação para o candidato (opcional)', `<textarea id="rs_ent_obs" rows="2" maxlength="300" style="width:100%;">${x(v.observacao)}</textarea>`)}
    </div>
    <label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:13px;"><input type="checkbox" id="rs_ent_email" ${v.enviarEmail && c.email ? 'checked' : ''} ${c.email ? '' : 'disabled'}> ${c.email ? 'Enviar e-mail ao candidato com data, hora e links de calendário' : 'Candidato sem e-mail cadastrado: não dá para avisar por e-mail'}</label>
    ${form.erro ? `<div class="notice info" role="alert" style="margin-top:8px;">${x(form.erro)}</div>` : ''}
    ${conflitos ? `<div class="notice info" role="alert" style="margin-top:8px;"><b>Atenção, há conflito de horário:</b><ul style="margin:4px 0 0 18px;">${conflitos}</ul></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-primary" onclick="salvarFormularioEntrevistaRS(${form.conflitos.length ? 'true' : 'false'})">${form.conflitos.length ? 'Agendar mesmo assim' : form.entrevistaId ? 'Salvar novo horário' : 'Agendar'}</button>
      <button class="btn btn-sm btn-ghost" onclick="fecharFormularioEntrevistaRS()">Cancelar</button>
    </div>
  </form>`;
}

function entrevistasPainelRS(c, vaga) {
  const gestor = agendaGestorRS();
  const lista = entrevistasDoCandidatoRS(c.id);
  const naEtapa = ENTREVISTA_ETAPAS_RS.includes(c.etapa) && !c.reprovado;
  if (!lista.length && !naEtapa) return '';
  const form = _rsAgendaForm && _rsAgendaForm.candidatoId === c.id && gestor ? formularioEntrevistaHtml(c, vaga) : '';
  const podeAgendar = gestor && !c.reprovado && etapasDeEntrevistaDaVagaRS(vaga).length > 0;
  return `<details style="margin-top:10px;" open><summary style="cursor:pointer;font-weight:600;font-size:13px;">Entrevistas (${lista.length})</summary>
    ${lista.length ? `<ul style="list-style:none;margin:8px 0 0;padding:0;font-size:13px;">${lista.map((e) => linhaEntrevistaHtml(e, gestor)).join('')}</ul>` : '<div class="small-muted" style="margin-top:6px;">Nenhuma entrevista marcada ainda.</div>'}
    ${podeAgendar && !form ? '<div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="abrirFormularioEntrevistaRS(\'' + escaparParaOnclick(c.id) + '\', null)">Agendar entrevista</button></div>' : ''}
    ${form}
  </details>`;
}

// ---------- a página R&S — Agenda ----------
function pageAgendaRS() {
  if (!agendaGestorRS()) return '<div class="empty">Você não tem acesso à agenda do recrutamento.</div>';
  garantirEntrevistasRS();
  const x = escaparHtml;
  const a = montarAgendaRS({
    entrevistas: state.rs.entrevistas,
    candidatos: state.rs.candidatos,
    requisicoes: state.rs.requisicoes,
    agora: Date.now(),
    hojeISO: hojeLocalISO(),
    vagaId: _rsAgendaFiltro.vagaId,
  });
  const vagas = state.rs.requisicoes.filter((r) => r.status === 'aprovada');
  const nomeVaga = (r) =>
    `${r.codigo} — ${(state.cargos.find((k) => k.id === r.cargoId) || {}).nome || 'vaga'}${r.encerrada ? ' (encerrada)' : ''}`;
  const btn = (texto, onclick, primario) =>
    `<button class="btn btn-sm ${primario ? 'btn-primary' : 'btn-ghost'}" onclick="${onclick}">${texto}</button>`;
  const linha = (e, comLembrete, comData) => {
    const id = escaparParaOnclick(e.id);
    return `<tr><td><b>${x(comData ? rotuloCurtoQuandoRS(e) : e.hora)}</b></td><td><a href="#" onclick="abrirCandidatoDaAgendaRS('${escaparParaOnclick(e.candidatoId)}');return false;">${x(e.candidato.nome)}</a><div class="small-muted">${x(etapaNomeRS(e.etapa))}</div></td><td>${x(ENTREVISTA_FORMATOS_RS[e.formato])}${e.local ? `<div class="small-muted">${x(e.local)}</div>` : ''}</td><td>${x(e.entrevistador || '—')}</td><td>${comLembrete ? `${btn('Enviar lembrete', `reenviarEmailEntrevistaRS('${id}', 'lembrete')`)} ${typeof abrirWhatsAppDaAgendaRS === 'function' ? `${btn('WhatsApp', `abrirWhatsAppDaAgendaRS('${escaparParaOnclick(e.candidatoId)}')`)} ` : ''}` : ''}${btn('Realizada', `mudarResultadoEntrevistaRS('${id}', 'realizada')`)} ${btn('Faltou', `mudarResultadoEntrevistaRS('${id}', 'faltou')`)}</td></tr>`;
  };
  const tabela = (legenda, linhas, primeiro = 'Hora') =>
    `<div style="overflow-x:auto;"><table><caption class="sr-only">${x(legenda)}</caption><thead><tr><th scope="col">${primeiro}</th><th scope="col">Candidato</th><th scope="col">Formato e local</th><th scope="col">Entrevistador</th><th scope="col">Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  const secao = (titulo, ajuda, corpo) =>
    `<div class="card"><h3 style="margin:0 0 2px;">${x(titulo)}</h3>${ajuda ? `<div class="small-muted" style="margin-bottom:10px;">${x(ajuda)}</div>` : ''}${corpo}</div>`;
  const diaTitulo = (iso) => {
    const [aa, mm, dd] = iso.split('-').map(Number);
    return `${DIAS_SEMANA_RS[new Date(Date.UTC(aa, mm - 1, dd)).getUTCDay()]}, ${dd} de ${MESES_RS[mm - 1]}`;
  };
  const vazio = !a.hoje.length && !a.porDia.length && !a.paraAtualizar.length && !a.semData.length;
  return `
    <div class="page-head"><div class="eyebrow">Pessoas</div><h1>R&S — Agenda</h1>
      <p class="page-desc">As entrevistas que estão marcadas, as que já passaram e esperam um resultado, e quem ainda está sem data. Agende na ficha de cada candidato.</p></div>
    <div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><label for="rs_ag_vaga" class="small-muted">Vaga</label>
        <select id="rs_ag_vaga" onchange="filtrarAgendaRS(this.value)" style="max-width:300px;"><option value="">Todas as vagas</option>${vagas.map((r) => `<option value="${x(r.id)}" ${_rsAgendaFiltro.vagaId === r.id ? 'selected' : ''}>${x(nomeVaga(r))}</option>`).join('')}</select></div>
      ${btn('Baixar a agenda (.ics)', 'baixarAgendaIcsRS()', true)}
    </div>
    ${vazio ? '<div class="card"><div class="empty">Nenhuma entrevista marcada. Leve um candidato para uma etapa de entrevista e agende na ficha dele.</div></div>' : ''}
    ${a.paraAtualizar.length ? secao('Para atualizar', 'Estas entrevistas já passaram. Registre se foram realizadas ou se o candidato faltou.', tabela('Entrevistas que já passaram sem resultado', a.paraAtualizar.map((e) => linha(e, false, true)).join(''), 'Quando')) : ''}
    ${a.hoje.length ? secao('Hoje', '', tabela('Entrevistas de hoje', a.hoje.map((e) => linha(e, true)).join(''))) : ''}
    ${a.porDia.length ? secao(`Próximos ${AGENDA_DIAS_A_FRENTE_RS} dias`, '', a.porDia.map((d) => `<h4 style="margin:10px 0 4px;font-size:13px;">${x(diaTitulo(d.data))}</h4>${tabela(`Entrevistas de ${diaTitulo(d.data)}`, d.itens.map((e) => linha(e, true)).join(''))}`).join('')) : ''}
    ${a.semData.length ? secao('Em etapa de entrevista, sem data marcada', '', `<ul style="list-style:none;margin:0;padding:0;">${a.semData.map((c) => `<li style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line);"><span>${x(c.nome)} <span class="small-muted">· ${x(etapaNomeRS(c.etapa))}</span></span>${btn('Agendar', `agendarDaAgendaRS('${escaparParaOnclick(c.id)}')`, true)}</li>`).join('')}</ul>`) : ''}`;
}
