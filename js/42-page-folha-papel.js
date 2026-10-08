/* =========================================================
   FOLHA DE PONTO EM PAPEL
   -----------------------------------------------------------
   Pra empresas que ainda registram o ponto à mão no papel: o RH
   fotografa a folha, o sistema "lê" a foto (IA — Edge Function
   "folha-ponto"), mostra tudo numa tabela editável, o RH CONFERE
   e corrige, e só então confirma. Depois da confirmação saem os
   totais (horas, atrasos, extras, faltas) e os relatórios.

   A IA só SUGERE a transcrição — nunca grava sozinha. A foto
   original fica guardada (bucket privado) como comprovante.

   O começo do arquivo são funções PURAS de cálculo (sem tela),
   testadas em tests/folha-ponto-calculos.test.js.
   ========================================================= */

const FOLHA_TIPOS = [
  ['trabalhado', 'Trabalhado'],
  ['falta', 'Falta'],
  ['folga', 'Folga / DSR'],
  ['atestado', 'Atestado'],
  ['feriado', 'Feriado'],
  ['ferias', 'Férias'],
];
// Dias que não entram na conta (nem como falta, nem como dia a cumprir).
const FOLHA_TIPOS_ABONADOS = ['folga', 'atestado', 'feriado', 'ferias'];
const FOLHA_DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "08:30" -> 510. Qualquer coisa que não seja um horário válido -> null.
function folhaMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 485 -> "8h05"; com sinal: +22 -> "+0h22", -22 -> "-0h22".
function folhaFormatarDuracao(min, comSinal = false) {
  const negativo = min < 0;
  const abs = Math.abs(Math.round(min));
  const texto = `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
  if (comSinal) return (negativo ? '-' : abs > 0 ? '+' : '') + texto;
  return (negativo ? '-' : '') + texto;
}

function folhaDiasDoMes(competencia) {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(ano, mes, 0).getDate();
}
function folhaDiaDaSemana(competencia, dia) {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(ano, mes - 1, dia).getDay();
}
function folhaEhDiaUtil(competencia, dia) {
  const d = folhaDiaDaSemana(competencia, dia);
  return d !== 0 && d !== 6;
}

function folhaMarcacoesValidas(marcacoes) {
  return (marcacoes || []).filter((m) => folhaMinutos(m) !== null);
}

// Soma os pares entrada→saída na ordem em que aparecem. Se a saída for
// "antes" da entrada, entende que o turno atravessou a meia-noite. Se sobrar
// uma marcação sem par, o dia é "incompleto" (o RH precisa conferir).
function folhaMinutosTrabalhados(marcacoes) {
  const v = folhaMarcacoesValidas(marcacoes).map(folhaMinutos);
  let minutos = 0;
  let suspeito = false;
  let atravessa = false;
  for (let i = 0; i + 1 < v.length; i += 2) {
    let diff = v[i + 1] - v[i];
    if (diff < 0) {
      diff += 1440;
      atravessa = true;
    }
    if (diff > 16 * 60) suspeito = true; // mais de 16h num par: quase certamente leitura errada
    minutos += diff;
  }
  return { minutos, completo: v.length > 0 && v.length % 2 === 0, suspeito, atravessa };
}

// Totais da folha. Mesma lógica do banco de horas do ponto eletrônico
// (atraso na 1ª marcação e hora extra na última, ambos depois da tolerância),
// pra os dois ficarem comparáveis — mais as horas efetivamente trabalhadas.
//   - folga/atestado/feriado/férias: não contam (abonados)
//   - falta: conta como falta
//   - dia útil sem nenhuma marcação e sem tipo: vai pra "semRegistro" (o RH
//     decide: não é falta nem presença até alguém conferir)
function folhaResumo(dias, jornada, competencia) {
  const j = jornada || {};
  const tol = Number(j.toleranciaMin) || 0;
  const entradaPrevista = folhaMinutos(j.entrada);
  const saidaPrevista = folhaMinutos(j.saida);
  const porDia = {};
  (dias || []).forEach((d) => {
    if (d && d.dia) porDia[d.dia] = d;
  });
  const r = {
    diasTrabalhados: 0,
    minutosTrabalhados: 0,
    atrasoMin: 0,
    extraMin: 0,
    saldoMin: 0,
    faltas: 0,
    abonados: 0,
    semRegistro: [],
    incompletos: [],
    suspeitos: [],
  };
  const n = folhaDiasDoMes(competencia);
  for (let dia = 1; dia <= n; dia++) {
    const d = porDia[dia] || {};
    const tipo = d.tipo || 'trabalhado';
    if (FOLHA_TIPOS_ABONADOS.includes(tipo)) {
      r.abonados++;
      continue;
    }
    if (tipo === 'falta') {
      r.faltas++;
      continue;
    }
    const validas = folhaMarcacoesValidas(d.marcacoes);
    if (!validas.length) {
      if (folhaEhDiaUtil(competencia, dia)) r.semRegistro.push(dia);
      continue;
    }
    r.diasTrabalhados++;
    const t = folhaMinutosTrabalhados(validas);
    r.minutosTrabalhados += t.minutos;
    if (!t.completo) r.incompletos.push(dia);
    if (t.suspeito) r.suspeitos.push(dia);
    // Turno que atravessa a meia-noite não dá pra comparar com um horário
    // de jornada "de dia" — fica só nas horas trabalhadas.
    if (t.atravessa) continue;
    const mins = validas.map(folhaMinutos);
    if (entradaPrevista !== null) r.atrasoMin += Math.max(0, mins[0] - entradaPrevista - tol);
    if (saidaPrevista !== null && t.completo) r.extraMin += Math.max(0, mins[mins.length - 1] - saidaPrevista - tol);
  }
  r.saldoMin = r.extraMin - r.atrasoMin;
  return r;
}

// Confere se o nome que a IA leu na folha combina com o colaborador
// escolhido (evita anexar a folha da Maria no cadastro do João). Basta
// um pedaço do nome em comum; se faltar informação, não reclama.
function folhaNomeCompativel(nomeLido, nomeEsperado) {
  if (!nomeLido || !nomeEsperado) return true;
  const partes = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  const lido = partes(nomeLido);
  const esperado = partes(nomeEsperado);
  if (!lido.length || !esperado.length) return true;
  return esperado.some((t) => lido.includes(t));
}

// "09/2026", "9-26", "09.2026" -> compara com a competência 'AAAA-MM'.
function folhaMesCompativel(mesLido, competencia) {
  const m = /(\d{1,2})\s*[/\-.]\s*(\d{2,4})/.exec(String(mesLido || ''));
  if (!m) return true;
  const mes = Number(m[1]);
  let ano = Number(m[2]);
  if (ano < 100) ano += 2000;
  const [anoComp, mesComp] = competencia.split('-').map(Number);
  return mes === mesComp && ano === anoComp;
}

/* ---------- Lista de presença do dia: funções puras ----------
   Uma folha = um dia, vários colaboradores, cada um escreve nome e hora.
   A IA devolve os nomes como estão escritos; aqui o sistema SUGERE quem é
   cada um e junta os horários — sempre pra conferência do RH. */

const FOLHA_PARTICULAS_NOME = ['de', 'da', 'do', 'dos', 'das', 'e'];

function folhaTokensNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FOLHA_PARTICULAS_NOME.includes(t));
}

// Distância de edição (quantas letras trocar/inserir/apagar pra um virar o outro).
function folhaDistancia(a, b) {
  const m = a.length;
  const n = b.length;
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[n];
}

// Como um pedaço do nome lido combina com um pedaço do nome cadastrado:
//   'igual' -> as mesmas letras
//   'aprox' -> é a inicial ("S." = Souza) ou é quase igual em nome longo
//              (1 letra de diferença — letra de mão). Nome curto exige
//              igualdade, pra "Mario" não virar "Maria".
//   null    -> não combina
function folhaTipoCombinacao(lido, cadastrado) {
  if (lido === cadastrado) return 'igual';
  if (lido.length === 1 && cadastrado.startsWith(lido)) return 'aprox';
  if (lido.length >= 6 && cadastrado.length >= 6 && folhaDistancia(lido, cadastrado) <= 1) return 'aprox';
  return null;
}

// Sugere qual colaborador é o nome lido. Devolve { id, nivel, candidatos }:
//   exato     -> UM colaborador bate com o nome inteiro, letra por letra
//   provavel  -> um único colaborador bate melhor (pelo menos metade do nome
//                lido, ou o nome inteiro mas com inicial/letra aproximada)
//   ambiguo   -> mais de um bate igualmente bem (ex.: só "Maria", ou
//                "Maria S." com uma Silva e uma Souza) — sem sugestão
//   nenhum    -> ninguém bate o bastante
// Só "exato" e "provavel" trazem um id sugerido; o RH sempre confere.
function folhaCasarNome(nomeLido, colaboradores) {
  const lido = folhaTokensNome(nomeLido);
  if (!lido.length) return { id: null, nivel: 'nenhum', candidatos: [] };
  const pontuados = [];
  (colaboradores || []).forEach((c) => {
    const cad = folhaTokensNome(c.nome);
    if (!cad.length) return;
    const usados = new Set();
    let casados = 0;
    let aprox = false;
    lido.forEach((tl) => {
      // prefere um pedaço igual; só usa o aproximado se não houver igual
      let achado = -1;
      let achadoAprox = false;
      cad.forEach((tc, idx) => {
        if (usados.has(idx)) return;
        const tipo = folhaTipoCombinacao(tl, tc);
        if (tipo === 'igual' && (achado < 0 || achadoAprox)) {
          achado = idx;
          achadoAprox = false;
        } else if (tipo === 'aprox' && achado < 0) {
          achado = idx;
          achadoAprox = true;
        }
      });
      if (achado >= 0) {
        usados.add(achado);
        casados++;
        if (achadoAprox) aprox = true;
      }
    });
    if (casados)
      pontuados.push({ id: c.id, nome: c.nome, score: casados / lido.length, cobertura: casados / cad.length, aprox });
  });
  pontuados.sort((a, b) => b.score - a.score || b.cobertura - a.cobertura);
  const candidatos = pontuados.slice(0, 5);
  if (!candidatos.length) return { id: null, nivel: 'nenhum', candidatos: [] };
  const melhor = candidatos[0];
  const exatos = candidatos.filter((c) => c.score === 1 && c.cobertura === 1 && !c.aprox);
  if (melhor.score === 1 && melhor.cobertura === 1 && !melhor.aprox && exatos.length === 1) {
    return { id: melhor.id, nivel: 'exato', candidatos };
  }
  if (candidatos.filter((c) => c.score === melhor.score).length > 1) return { id: null, nivel: 'ambiguo', candidatos };
  if (melhor.score >= 0.5) return { id: melhor.id, nivel: 'provavel', candidatos };
  return { id: null, nivel: 'nenhum', candidatos };
}

// Junta duas listas de horários: só horários válidos, sem repetir, em ordem
// do relógio. Quem aparece 2x com o mesmo horário (foto importada duas
// vezes) não vira horário duplicado.
function folhaMesclarMarcacoes(a, b) {
  const minutos = new Set();
  [...(a || []), ...(b || [])].forEach((h) => {
    const m = folhaMinutos(h);
    if (m !== null) minutos.add(m);
  });
  return [...minutos]
    .sort((x, y) => x - y)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

const FOLHA_ORDEM_CONFIANCA = { baixa: 0, media: 1, alta: 2 };
function folhaPiorConfianca(a, b) {
  const x = FOLHA_ORDEM_CONFIANCA[a] === undefined ? 2 : FOLHA_ORDEM_CONFIANCA[a];
  const y = FOLHA_ORDEM_CONFIANCA[b] === undefined ? 2 : FOLHA_ORDEM_CONFIANCA[b];
  return x <= y ? a || 'alta' : b || 'alta';
}

// Coloca o dia de uma lista de presença dentro da folha do mês de um
// colaborador. modo 'somar' junta com o que o dia já tinha; 'substituir'
// troca. Nunca mexe nos outros dias. Devolve uma lista nova (não altera a original).
function folhaAplicarDia(dias, novo, modo) {
  const lista = (dias || []).map((d) => ({ ...d, marcacoes: [...(d.marcacoes || [])] }));
  const i = lista.findIndex((d) => d.dia === novo.dia);
  const atual = i >= 0 ? lista[i] : null;
  const somar = atual && modo === 'somar';
  const dia = {
    dia: novo.dia,
    marcacoes: folhaMesclarMarcacoes(somar ? atual.marcacoes : [], novo.marcacoes),
    tipo: 'trabalhado',
    observacao: novo.observacao || (atual && atual.observacao) || '',
    confianca: somar ? folhaPiorConfianca(atual.confianca, novo.confianca) : novo.confianca || 'alta',
  };
  if (i >= 0) lista[i] = dia;
  else lista.push(dia);
  lista.sort((x, y) => x.dia - y.dia);
  return lista;
}

// Como fica o dia dessa pessoa na folha dela: novo, já tem horários (decidir
// somar/substituir), ou bloqueado porque a folha já foi confirmada.
function folhaListaDiaSituacao(folhaExistente, dia) {
  if (!folhaExistente) return { tipo: 'novo', atuais: [] };
  const d = (folhaExistente.dias || []).find((x) => x.dia === dia);
  const atuais = folhaMarcacoesValidas(d && d.marcacoes);
  if (folhaExistente.status === 'confirmada') return { tipo: 'bloqueado', atuais };
  return atuais.length ? { tipo: 'existente', atuais } : { tipo: 'novo', atuais: [] };
}

// 'AAAA-MM-DD' que realmente existe no calendário?
function folhaDataValida(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 2000 || ano > 2100) return false;
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

/* ---------- Estado da tela ---------- */

let _folhasPapel = [];
let _folhasPapelCarregadas = false;
let _folhasPapelCarregando = false;
let _folhaCompetencia = null; // 'AAAA-MM'
let _folhaAberta = null; // cópia de trabalho da folha que está sendo conferida
let _folhaSujo = false; // tem alteração ainda não salva?
let _folhaProcessando = false; // lendo foto agora
let _folhaAvisos = [];
let _folhaNovaColabId = '';

function folhaCompetenciaAtual() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}
function folhaRotuloCompetencia(c) {
  const [ano, mes] = c.split('-');
  return `${mes}/${ano}`;
}
function folhaJornadaDe(colaboradorId) {
  const colab = (state.colaboradores || []).find((c) => c.id === colaboradorId);
  return (colab && colab.jornada) || JORNADA_PADRAO;
}

async function carregarFolhasPapel() {
  if (_folhasPapelCarregando) return;
  _folhasPapelCarregando = true;
  const { data, error } = await sb
    .from('folhas_ponto_papel')
    .select('id, colaborador_id, colaborador_nome, competencia, imagens, dias, status, confirmada_em, atualizado_em')
    .eq('empresa_id', empresaIdAtual)
    .eq('competencia', _folhaCompetencia)
    .order('colaborador_nome', { ascending: true });
  if (error) {
    console.error('Falha ao carregar folhas de ponto em papel', error);
    showToast('Não foi possível carregar as folhas. Verifique se a migration 37 foi aplicada.');
    _folhasPapel = [];
  } else {
    _folhasPapel = data || [];
  }
  _folhasPapelCarregando = false;
  _folhasPapelCarregadas = true;
  render();
}

function folhaMudarCompetencia(valor) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor || '')) return;
  if (_folhaSujo && !confirm('Há alterações não salvas nesta folha. Trocar de mês mesmo assim?')) {
    render();
    return;
  }
  _folhaCompetencia = valor;
  _folhaAberta = null;
  _folhaSujo = false;
  _folhasPapelCarregadas = false;
  render();
}

function folhaAbrir(colaboradorId) {
  const existente = _folhasPapel.find((f) => f.colaborador_id === colaboradorId);
  if (existente) {
    _folhaAberta = JSON.parse(JSON.stringify(existente));
  } else {
    const colab = (state.colaboradores || []).find((c) => c.id === colaboradorId);
    if (!colab) {
      showToast('Escolha um colaborador.');
      return;
    }
    _folhaAberta = {
      id: null,
      colaborador_id: colaboradorId,
      colaborador_nome: colab.nome,
      competencia: _folhaCompetencia,
      imagens: [],
      dias: [],
      status: 'rascunho',
    };
  }
  _folhaAvisos = [];
  _folhaSujo = false;
  render();
}

function folhaFechar() {
  if (_folhaSujo && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
  _folhaAberta = null;
  _folhaSujo = false;
  _folhasPapelCarregadas = false; // recarrega a lista com os totais atualizados
  render();
}

/* ---------- Edição dos dias ---------- */

function folhaGarantirDia(dia) {
  let d = _folhaAberta.dias.find((x) => x.dia === dia);
  if (!d) {
    d = { dia, marcacoes: [], tipo: 'trabalhado', observacao: '', confianca: 'alta' };
    _folhaAberta.dias.push(d);
    _folhaAberta.dias.sort((a, b) => a.dia - b.dia);
  }
  return d;
}

// Atualiza só o total do dia e o resumo, SEM refazer a tela inteira — assim
// o cursor não sai do campo enquanto o RH vai corrigindo os horários.
function folhaAtualizarDiaNaTela(dia) {
  const f = _folhaAberta;
  if (!f) return;
  const d = f.dias.find((x) => x.dia === dia) || {};
  const celula = document.getElementById(`fp_tot_${dia}`);
  if (celula) celula.innerHTML = folhaTotalDiaHtml(d);
  const conf = document.getElementById(`fp_conf_${dia}`);
  if (conf) conf.innerHTML = folhaConfiancaHtml(d, f.status !== 'confirmada');
  const resumo = document.getElementById('fp_resumo');
  if (resumo) resumo.innerHTML = folhaResumoHtml();
}

function folhaEditarMarcacao(dia, idx, valor) {
  if (!_folhaAberta || _folhaAberta.status === 'confirmada') return;
  const d = folhaGarantirDia(dia);
  const texto = String(valor || '').trim();
  const h = texto ? normalizarHora(texto) : '';
  const campo = document.getElementById(`fp_m_${dia}_${idx}`);
  if (texto && !h) {
    showToast('Horário inválido. Use o formato 08:30.');
    if (campo) campo.value = d.marcacoes[idx] || '';
    return;
  }
  while (d.marcacoes.length <= idx) d.marcacoes.push('');
  d.marcacoes[idx] = h;
  while (d.marcacoes.length && !d.marcacoes[d.marcacoes.length - 1]) d.marcacoes.pop();
  d.confianca = 'alta'; // quem mexeu, conferiu
  if (campo) campo.value = h;
  _folhaSujo = true;
  folhaAtualizarDiaNaTela(dia);
}

function folhaEditarTipo(dia, tipo) {
  if (!_folhaAberta || _folhaAberta.status === 'confirmada') return;
  if (!FOLHA_TIPOS.some(([v]) => v === tipo)) return;
  const d = folhaGarantirDia(dia);
  d.tipo = tipo;
  d.confianca = 'alta';
  _folhaSujo = true;
  folhaAtualizarDiaNaTela(dia);
}

function folhaEditarObs(dia, valor) {
  if (!_folhaAberta || _folhaAberta.status === 'confirmada') return;
  folhaGarantirDia(dia).observacao = String(valor || '')
    .trim()
    .slice(0, 120);
  _folhaSujo = true;
}

function folhaConferirDia(dia) {
  if (!_folhaAberta || _folhaAberta.status === 'confirmada') return;
  folhaGarantirDia(dia).confianca = 'alta';
  _folhaSujo = true;
  folhaAtualizarDiaNaTela(dia);
}

/* ---------- Foto: compressão, leitura por IA ---------- */

// Reduz a foto do celular (muitas vezes 4–8 MB) antes de enviar: mais rápido,
// mais barato, e cabe no limite da leitura. 2000px de lado maior mantém a
// letra legível.
function folhaComprimirImagem(arquivo, ladoMax = 2000, qualidade = 0.85) {
  return comprimirImagem(arquivo, ladoMax, qualidade);
}

// Quando a Edge Function responde com erro (limite, falta de configuração...),
// o texto útil vem no corpo da resposta, não em error.message.
async function folhaMensagemDeErro(error, data) {
  if (data && data.error) return data.error;
  try {
    if (error && error.context && typeof error.context.json === 'function') {
      const corpo = await error.context.json();
      if (corpo && corpo.error) return corpo.error;
    }
  } catch (e) {
    // sem corpo legível — segue com a mensagem padrão
  }
  return 'Não foi possível ler a folha agora. Tente novamente.';
}

async function folhaLerFoto(input) {
  const arquivo = input.files && input.files[0];
  input.value = '';
  const f = _folhaAberta;
  if (!arquivo || !f || f.status === 'confirmada' || _folhaProcessando) return;
  if (!/^image\//.test(arquivo.type)) {
    showToast('Selecione uma imagem (foto da folha).');
    return;
  }
  if (
    f.dias.length &&
    !confirm('Esta folha já tem dados. A nova leitura substitui os dias que aparecerem na nova foto. Continuar?')
  )
    return;

  _folhaProcessando = true;
  render();
  try {
    let imagemBase64;
    try {
      imagemBase64 = await folhaComprimirImagem(arquivo);
    } catch (e) {
      showToast('Não consegui abrir essa imagem. Tente tirar a foto direto pela câmera ou salvar como JPG.');
      return;
    }
    const { data, error } = await sb.functions.invoke('folha-ponto', {
      body: { action: 'ler_foto', competencia: f.competencia, colaboradorNome: f.colaborador_nome, imagemBase64 },
    });
    if (error || !data || data.error) {
      showToast(await folhaMensagemDeErro(error, data));
      return;
    }
    (data.dias || []).forEach((novo) => {
      const i = f.dias.findIndex((x) => x.dia === novo.dia);
      if (i >= 0) f.dias[i] = novo;
      else f.dias.push(novo);
    });
    f.dias.sort((a, b) => a.dia - b.dia);
    f.imagens.push({ path: data.imagemPath, enviadaEm: new Date().toISOString() });

    _folhaAvisos = [...(data.avisos || [])];
    if (!folhaNomeCompativel(data.nomeLido, f.colaborador_nome)) {
      _folhaAvisos.unshift(
        `O nome lido na folha ("${data.nomeLido}") não parece ser de ${f.colaborador_nome}. Confira se é a folha certa.`
      );
    }
    if (!folhaMesCompativel(data.mesLido, f.competencia)) {
      _folhaAvisos.unshift(
        `O mês lido na folha ("${data.mesLido}") é diferente de ${folhaRotuloCompetencia(f.competencia)}. Confira.`
      );
    }
    if (!(data.dias || []).length)
      _folhaAvisos.push('Nenhum dia foi reconhecido nesta foto. Tente uma foto mais nítida e bem enquadrada.');

    _folhaSujo = true;
    await folhaSalvarRascunho(true); // guarda já, pra não perder a leitura nem a foto se fechar a aba
    registrarAuditoria('folha_papel.lida', {
      colaboradorId: f.colaborador_id,
      competencia: f.competencia,
      dias: (data.dias || []).length,
    });
    showToast(`Foto lida — confira os dias destacados. Leituras restantes neste mês: ${data.leiturasRestantes}.`);
  } finally {
    _folhaProcessando = false;
    render();
  }
}

async function folhaVerFoto(indice) {
  const img = _folhaAberta && _folhaAberta.imagens[indice];
  if (!img) return;
  const { data, error } = await sb.functions.invoke('folha-ponto', { body: { action: 'url_imagem', path: img.path } });
  if (error || !data || !data.url) {
    showToast('Não foi possível abrir a foto agora.');
    return;
  }
  window.open(data.url, '_blank', 'noopener');
}

/* ---------- Salvar, confirmar, reabrir, excluir ---------- */

async function folhaSalvarRascunho(silencioso = false) {
  const f = _folhaAberta;
  if (!f || f.status === 'confirmada') return false;
  const registro = {
    empresa_id: empresaIdAtual,
    colaborador_id: f.colaborador_id,
    colaborador_nome: f.colaborador_nome,
    competencia: f.competencia,
    imagens: f.imagens,
    dias: f.dias,
    status: 'rascunho',
  };
  if (!f.id) registro.criado_por = meuPerfilId;
  const { data, error } = await sb
    .from('folhas_ponto_papel')
    .upsert(registro, { onConflict: 'empresa_id,colaborador_id,competencia' })
    .select('id')
    .single();
  if (error) {
    console.error('Falha ao salvar folha de ponto em papel', error);
    showToast('Não foi possível salvar: ' + error.message);
    return false;
  }
  f.id = data.id;
  _folhaSujo = false;
  if (!silencioso) {
    showToast('Rascunho salvo.');
    render();
  }
  return true;
}

async function folhaConfirmar() {
  const f = _folhaAberta;
  if (!f || f.status === 'confirmada') return;
  const r = folhaResumo(f.dias, folhaJornadaDe(f.colaborador_id), f.competencia);
  const avisos = [];
  if (!f.imagens.length) avisos.push('Nenhuma foto foi enviada — não vai existir comprovante do papel nesta folha.');
  if (r.semRegistro.length)
    avisos.push(
      `${r.semRegistro.length} dia(s) útil(eis) sem marcação (dia ${r.semRegistro.join(', ')}) — ficam como "sem registro", nem falta nem presença.`
    );
  if (r.incompletos.length)
    avisos.push(
      `${r.incompletos.length} dia(s) com marcação incompleta (dia ${r.incompletos.join(', ')}) — só os pares completos entram nas horas.`
    );
  if (r.suspeitos.length)
    avisos.push(
      `${r.suspeitos.length} dia(s) com um período maior que 16h (dia ${r.suspeitos.join(', ')}) — possível erro de leitura.`
    );
  const pergunta = avisos.length
    ? `Atenção:\n\n• ${avisos.join('\n• ')}\n\nConfirmar a folha mesmo assim?`
    : 'Confirmar esta folha? Depois de confirmada ela só pode ser alterada reabrindo.';
  if (!confirm(pergunta)) return;

  if (!(await folhaSalvarRascunho(true))) return;
  const { error } = await sb
    .from('folhas_ponto_papel')
    .update({ status: 'confirmada', confirmada_por: meuPerfilId, confirmada_em: new Date().toISOString() })
    .eq('id', f.id);
  if (error) {
    showToast('Não foi possível confirmar: ' + error.message);
    return;
  }
  f.status = 'confirmada';
  f.confirmada_em = new Date().toISOString();
  registrarAuditoria('folha_papel.confirmada', {
    colaboradorId: f.colaborador_id,
    competencia: f.competencia,
    diasTrabalhados: r.diasTrabalhados,
    horasTrabalhadas: folhaFormatarDuracao(r.minutosTrabalhados),
  });
  showToast('Folha confirmada.');
  render();
}

async function folhaReabrir() {
  const f = _folhaAberta;
  if (!f || f.status !== 'confirmada') return;
  const motivo = (prompt('Por que reabrir esta folha? (fica registrado no log)') || '').trim();
  if (motivo.length < 5) {
    showToast('Informe o motivo da reabertura (pelo menos 5 caracteres).');
    return;
  }
  const { error } = await sb
    .from('folhas_ponto_papel')
    .update({ status: 'rascunho', confirmada_por: null, confirmada_em: null })
    .eq('id', f.id);
  if (error) {
    showToast('Não foi possível reabrir: ' + error.message);
    return;
  }
  f.status = 'rascunho';
  f.confirmada_em = null;
  registrarAuditoria('folha_papel.reaberta', { colaboradorId: f.colaborador_id, competencia: f.competencia, motivo });
  showToast('Folha reaberta para edição.');
  render();
}

async function folhaExcluirRascunho() {
  const f = _folhaAberta;
  if (!f || f.status === 'confirmada') return;
  if (!confirm('Excluir este rascunho e as fotos enviadas? Isso não pode ser desfeito.')) return;
  if (f.id) {
    const { error } = await sb.from('folhas_ponto_papel').delete().eq('id', f.id);
    if (error) {
      showToast('Não foi possível excluir: ' + error.message);
      return;
    }
    const paths = f.imagens.map((i) => i.path);
    if (paths.length)
      sb.functions.invoke('folha-ponto', { body: { action: 'remover_imagens', paths } }).catch(() => {});
    registrarAuditoria('folha_papel.excluida', { colaboradorId: f.colaborador_id, competencia: f.competencia });
  }
  _folhaAberta = null;
  _folhaSujo = false;
  _folhasPapelCarregadas = false;
  showToast('Rascunho excluído.');
  render();
}

/* ---------- Exportações ---------- */

async function folhaExportarPdf() {
  const f = _folhaAberta;
  if (!f) return;
  await garantirJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const r = folhaResumo(f.dias, folhaJornadaDe(f.colaborador_id), f.competencia);
  const n = folhaDiasDoMes(f.competencia);
  const porDia = {};
  f.dias.forEach((d) => (porDia[d.dia] = d));

  doc.setFontSize(16);
  doc.text('Folha de Ponto', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(state.empresa?.nomeFantasia || '', 14, 24);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(`Colaborador: ${f.colaborador_nome}`, 14, 33);
  doc.text(`Competência: ${folhaRotuloCompetencia(f.competencia)}`, 14, 39);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    f.status === 'confirmada'
      ? `Conferida e confirmada em ${new Date(f.confirmada_em).toLocaleDateString('pt-BR')}`
      : 'RASCUNHO — ainda não confirmada',
    14,
    45
  );
  doc.setTextColor(0);

  const corCabecalho = hexParaRgb(state.configuracoes?.identidadeVisual?.corPrimaria);
  const corpo = [];
  for (let dia = 1; dia <= n; dia++) {
    const d = porDia[dia] || {};
    const tipo = d.tipo || 'trabalhado';
    const rotuloTipo = (FOLHA_TIPOS.find(([v]) => v === tipo) || [])[1] || '';
    const t = folhaMinutosTrabalhados(d.marcacoes);
    corpo.push([
      String(dia).padStart(2, '0'),
      FOLHA_DIAS_SEMANA[folhaDiaDaSemana(f.competencia, dia)],
      folhaMarcacoesValidas(d.marcacoes).join('  '),
      t.minutos ? folhaFormatarDuracao(t.minutos) : '',
      tipo === 'trabalhado' ? '' : rotuloTipo,
      d.observacao || '',
    ]);
  }
  doc.autoTable({
    startY: 50,
    head: [['Dia', 'Sem', 'Marcações', 'Total', 'Tipo', 'Observação']],
    body: corpo,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: corCabecalho },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 12 }, 3: { cellWidth: 18 }, 4: { cellWidth: 24 } },
  });
  const yResumo = doc.lastAutoTable.finalY + 6;
  doc.autoTable({
    startY: yResumo,
    head: [['Resumo do mês', '']],
    body: [
      ['Dias trabalhados', String(r.diasTrabalhados)],
      ['Horas trabalhadas', folhaFormatarDuracao(r.minutosTrabalhados)],
      ['Atrasos', folhaFormatarDuracao(r.atrasoMin)],
      ['Horas extras', folhaFormatarDuracao(r.extraMin)],
      ['Saldo (extras − atrasos)', folhaFormatarDuracao(r.saldoMin, true)],
      ['Faltas', String(r.faltas)],
      ['Dias úteis sem registro', String(r.semRegistro.length)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: corCabecalho },
    tableWidth: 90,
  });
  const yAss = Math.min(doc.lastAutoTable.finalY + 22, 280);
  doc.setFontSize(9);
  doc.line(14, yAss, 90, yAss);
  doc.text('Colaborador', 14, yAss + 5);
  doc.line(110, yAss, 196, yAss);
  doc.text('RH / Responsável', 110, yAss + 5);
  doc.setTextColor(120);
  doc.text('Transcrição de folha de ponto em papel — a foto original fica arquivada no sistema.', 14, 290);
  doc.save(`folha_ponto_${f.colaborador_nome.replace(/\s+/g, '_')}_${f.competencia}.pdf`);
}

async function folhaExportarConsolidado() {
  if (!_folhasPapel.length) {
    showToast('Não há folhas neste mês para exportar.');
    return;
  }
  await garantirXLSX();
  const decimal = (min) => Math.round((min / 60) * 100) / 100;
  const linhas = _folhasPapel.map((f) => {
    const r = folhaResumo(f.dias, folhaJornadaDe(f.colaborador_id), f.competencia);
    return {
      Colaborador: f.colaborador_nome,
      Competência: folhaRotuloCompetencia(f.competencia),
      Situação: f.status === 'confirmada' ? 'Confirmada' : 'Rascunho',
      'Dias trabalhados': r.diasTrabalhados,
      'Horas trabalhadas (h:mm)': folhaFormatarDuracao(r.minutosTrabalhados),
      'Horas trabalhadas (decimal)': decimal(r.minutosTrabalhados),
      Atrasos: folhaFormatarDuracao(r.atrasoMin),
      'Horas extras': folhaFormatarDuracao(r.extraMin),
      'Saldo (h:mm)': folhaFormatarDuracao(r.saldoMin, true),
      'Saldo (decimal)': decimal(r.saldoMin),
      Faltas: r.faltas,
      'Dias úteis sem registro': r.semRegistro.length,
      'Dias com marcação incompleta': r.incompletos.length,
    };
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = larguraColunas([Object.keys(linhas[0]), ...linhas.map((l) => Object.values(l))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Folhas de ponto');
  XLSX.writeFile(wb, `folhas_ponto_papel_${_folhaCompetencia}.xlsx`);
}

/* ---------- Lista de presença do dia: fluxo ----------
   foto -> IA lê data e nomes+horários -> sistema sugere quem é cada nome ->
   RH confere -> "Aplicar": cada pessoa recebe esse DIA na folha do mês dela. */

let _listaDia = null;
// { lendo, path, data:'AAAA-MM-DD', linhas:[...], avisos:[], existentes:{colaboradorId: folha}, existentesComp }

function folhaListaDiaNovo() {
  return { lendo: false, path: null, data: '', linhas: [], avisos: [], existentes: {}, existentesComp: null };
}

function folhaListaDiaAbrir() {
  _folhaAberta = null;
  _folhaSujo = false;
  _listaDia = folhaListaDiaNovo();
  render();
}

function folhaListaDiaFechar() {
  const L = _listaDia;
  if (!L) return;
  if (L.path) {
    if (!confirm('Sair sem aplicar? A leitura desta foto será descartada.')) return;
    sb.functions.invoke('folha-ponto', { body: { action: 'remover_imagens', paths: [L.path] } }).catch(() => {});
  }
  _listaDia = null;
  render();
}

function folhaListaDiaDia() {
  return _listaDia && folhaDataValida(_listaDia.data) ? Number(_listaDia.data.slice(8, 10)) : null;
}

function folhaListaDiaSituacaoDe(linha) {
  if (!linha.colaboradorId) return { tipo: 'sem_colaborador', atuais: [] };
  const dia = folhaListaDiaDia();
  if (dia === null) return { tipo: 'sem_data', atuais: [] };
  return folhaListaDiaSituacao(_listaDia.existentes[linha.colaboradorId], dia);
}

// Linhas que vão mesmo ser aplicadas: marcadas, com colaborador, com horário
// e cuja folha não esteja confirmada.
function folhaListaDiaAplicaveis() {
  const L = _listaDia;
  if (!L || folhaListaDiaDia() === null) return [];
  return L.linhas
    .map((l, i) => ({ l, i }))
    .filter(
      ({ l }) =>
        l.aplicar &&
        l.colaboradorId &&
        folhaMesclarMarcacoes([], l.marcacoes).length &&
        folhaListaDiaSituacaoDe(l).tipo !== 'bloqueado'
    )
    .map(({ i }) => i);
}

async function folhaListaDiaCarregarExistentes() {
  const L = _listaDia;
  if (!L || !folhaDataValida(L.data)) return;
  const comp = L.data.slice(0, 7);
  if (L.existentesComp === comp) return;
  const { data, error } = await sb
    .from('folhas_ponto_papel')
    .select('id, colaborador_id, colaborador_nome, competencia, imagens, dias, status, criado_por')
    .eq('empresa_id', empresaIdAtual)
    .eq('competencia', comp);
  if (_listaDia !== L) return; // a pessoa saiu da tela enquanto carregava
  if (error) {
    console.error('Falha ao carregar folhas existentes', error);
    showToast('Não foi possível conferir as folhas já existentes deste mês.');
    L.existentes = {};
    L.existentesComp = null;
    return;
  }
  L.existentes = {};
  (data || []).forEach((f) => {
    L.existentes[f.colaborador_id] = f;
  });
  L.existentesComp = comp;
}

// Desmarca as linhas cuja folha está confirmada (não dá pra aplicar nelas).
function folhaListaDiaDesmarcarBloqueados() {
  _listaDia.linhas.forEach((l) => {
    if (folhaListaDiaSituacaoDe(l).tipo === 'bloqueado') l.aplicar = false;
  });
}

async function folhaListaDiaLerFoto(input) {
  const arquivo = input.files && input.files[0];
  input.value = '';
  const L = _listaDia;
  if (!arquivo || !L || L.lendo) return;
  if (!/^image\//.test(arquivo.type)) {
    showToast('Selecione uma imagem (foto da lista).');
    return;
  }
  if (L.path && !confirm('Já existe uma leitura nesta tela. Substituir pela nova foto?')) return;
  const pathAntigo = L.path;
  L.lendo = true;
  render();
  try {
    let imagemBase64;
    try {
      imagemBase64 = await folhaComprimirImagem(arquivo);
    } catch (e) {
      showToast('Não consegui abrir essa imagem. Tente tirar a foto direto pela câmera ou salvar como JPG.');
      return;
    }
    const { data, error } = await sb.functions.invoke('folha-ponto', {
      body: { action: 'ler_lista_dia', imagemBase64 },
    });
    if (error || !data || data.error) {
      showToast(await folhaMensagemDeErro(error, data));
      return;
    }
    if (pathAntigo)
      sb.functions.invoke('folha-ponto', { body: { action: 'remover_imagens', paths: [pathAntigo] } }).catch(() => {});

    const ativos = (state.colaboradores || []).filter((c) => !c.inativo).map((c) => ({ id: c.id, nome: c.nome }));
    L.path = data.imagemPath;
    L.data = data.dataLida || '';
    L.avisos = [...(data.avisos || [])];
    L.linhas = (data.pessoas || []).map((p) => {
      const m = folhaCasarNome(p.nomeLido, ativos);
      return {
        nomeLido: p.nomeLido,
        colaboradorId: m.id || '',
        nivel: m.nivel,
        candidatos: m.candidatos.map((c) => c.id),
        marcacoes: [...p.horarios],
        confianca: p.confianca,
        observacao: p.observacao || '',
        aplicar: !!m.id && p.horarios.length > 0,
        modo: 'somar',
      };
    });
    if (!data.dataLida) L.avisos.unshift('Não consegui ler a data da folha — informe a data acima antes de aplicar.');
    if (!L.linhas.length)
      L.avisos.push('Nenhum nome foi reconhecido nesta foto. Tente uma foto mais nítida e bem enquadrada.');
    L.existentes = {};
    L.existentesComp = null;
    await folhaListaDiaCarregarExistentes();
    if (_listaDia === L) folhaListaDiaDesmarcarBloqueados();
    registrarAuditoria('folha_papel.lista_dia_lida', { data: L.data || null, nomes: L.linhas.length });
    showToast(`Foto lida: ${L.linhas.length} nome(s). Leituras restantes neste mês: ${data.leiturasRestantes}.`);
  } finally {
    L.lendo = false;
    render();
  }
}

async function folhaListaDiaMudarData(valor) {
  const L = _listaDia;
  if (!L) return;
  L.data = valor || '';
  await folhaListaDiaCarregarExistentes();
  if (_listaDia === L) folhaListaDiaDesmarcarBloqueados();
  render();
}

function folhaListaDiaTrocarColab(i, id) {
  const l = _listaDia.linhas[i];
  l.colaboradorId = id;
  l.aplicar =
    !!id && folhaMesclarMarcacoes([], l.marcacoes).length > 0 && folhaListaDiaSituacaoDe(l).tipo !== 'bloqueado';
  render();
}

function folhaListaDiaToggle(i, marcado) {
  _listaDia.linhas[i].aplicar = marcado;
  folhaListaDiaAtualizarBotao();
}

function folhaListaDiaModo(i, modo) {
  _listaDia.linhas[i].modo = modo === 'substituir' ? 'substituir' : 'somar';
}

function folhaListaDiaConferir(i) {
  _listaDia.linhas[i].confianca = 'alta';
  render();
}

function folhaListaDiaTotalHtml(l) {
  const ord = folhaMesclarMarcacoes([], l.marcacoes);
  if (!ord.length) return '<span class="small-muted">sem horário</span>';
  const t = folhaMinutosTrabalhados(ord);
  const alerta =
    !t.completo || t.suspeito
      ? ' <span title="Horário sem par ou período longo demais — confira" style="color:var(--iniciar);">⚠</span>'
      : '';
  return `${folhaFormatarDuracao(t.minutos)}${alerta}`;
}

function folhaListaDiaAtualizarBotao() {
  const b = document.getElementById('ld_btn_aplicar');
  if (b) b.textContent = `Aplicar às folhas (${folhaListaDiaAplicaveis().length})`;
}

function folhaListaDiaEditarMarcacao(i, k, valor) {
  const l = _listaDia.linhas[i];
  const texto = String(valor || '').trim();
  const h = texto ? normalizarHora(texto) : '';
  const campo = document.getElementById(`ld_m_${i}_${k}`);
  if (texto && !h) {
    showToast('Horário inválido. Use o formato 08:30.');
    if (campo) campo.value = l.marcacoes[k] || '';
    return;
  }
  while (l.marcacoes.length <= k) l.marcacoes.push('');
  l.marcacoes[k] = h;
  while (l.marcacoes.length && !l.marcacoes[l.marcacoes.length - 1]) l.marcacoes.pop();
  l.confianca = 'alta'; // quem mexeu, conferiu
  if (campo) campo.value = h;
  const cel = document.getElementById(`ld_tot_${i}`);
  if (cel) cel.innerHTML = folhaListaDiaTotalHtml(l);
  folhaListaDiaAtualizarBotao();
}

async function folhaListaDiaAplicar() {
  const L = _listaDia;
  if (!L) return;
  const dia = folhaListaDiaDia();
  if (dia === null) {
    showToast('Informe a data da folha antes de aplicar.');
    return;
  }
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  if (L.data > hojeIso && !confirm(`A data ${L.data.split('-').reverse().join('/')} é no futuro. Aplicar mesmo assim?`))
    return;

  const indices = folhaListaDiaAplicaveis();
  if (!indices.length) {
    showToast('Nenhuma linha pronta para aplicar. Marque as linhas e escolha o colaborador de cada uma.');
    return;
  }
  // Duas linhas apontando pro mesmo colaborador (nome escrito de dois jeitos): junta tudo.
  const grupos = new Map();
  indices.forEach((i) => {
    const l = L.linhas[i];
    const g = grupos.get(l.colaboradorId) || { marcacoes: [], confianca: 'alta', observacao: '', modo: l.modo };
    g.marcacoes.push(...l.marcacoes);
    g.confianca = folhaPiorConfianca(g.confianca, l.confianca);
    g.observacao = g.observacao || l.observacao;
    if (l.modo === 'substituir') g.modo = 'substituir';
    grupos.set(l.colaboradorId, g);
  });
  const bloqueados = L.linhas.filter(
    (l) => l.aplicar && l.colaboradorId && folhaListaDiaSituacaoDe(l).tipo === 'bloqueado'
  ).length;
  const semColab = L.linhas.filter((l) => !l.colaboradorId).length;
  const notas = [];
  if (bloqueados)
    notas.push(`${bloqueados} linha(s) de folha já confirmada ficam de fora (reabra a folha pra alterar).`);
  if (semColab) notas.push(`${semColab} nome(s) sem colaborador escolhido ficam de fora.`);
  if (grupos.size < indices.length) notas.push('Nomes diferentes que apontam pro mesmo colaborador serão somados.');
  const dataBr = L.data.split('-').reverse().join('/');
  if (
    !confirm(
      `Aplicar a lista de ${dataBr} a ${grupos.size} colaborador(es)?${notas.length ? '\n\n• ' + notas.join('\n• ') : ''}`
    )
  )
    return;

  const agora = new Date().toISOString();
  const comp = L.data.slice(0, 7);
  const registros = [];
  grupos.forEach((g, colaboradorId) => {
    const existente = L.existentes[colaboradorId];
    const colab = (state.colaboradores || []).find((c) => c.id === colaboradorId);
    const imagens = [...((existente && existente.imagens) || [])];
    if (!imagens.some((im) => im.path === L.path))
      imagens.push({ path: L.path, enviadaEm: agora, origem: 'lista_diaria', dia });
    registros.push({
      empresa_id: empresaIdAtual,
      colaborador_id: colaboradorId,
      colaborador_nome: (existente && existente.colaborador_nome) || (colab && colab.nome) || '',
      competencia: comp,
      imagens,
      dias: folhaAplicarDia(
        existente && existente.dias,
        { dia, marcacoes: g.marcacoes, observacao: g.observacao, confianca: g.confianca },
        g.modo
      ),
      status: 'rascunho',
      criado_por: existente ? existente.criado_por : meuPerfilId,
    });
  });
  const { error } = await sb
    .from('folhas_ponto_papel')
    .upsert(registros, { onConflict: 'empresa_id,colaborador_id,competencia' });
  if (error) {
    console.error('Falha ao aplicar lista do dia', error);
    showToast('Não foi possível aplicar: ' + error.message);
    return;
  }
  registrarAuditoria('folha_papel.lista_dia_aplicada', { data: L.data, colaboradores: grupos.size, bloqueados });
  showToast(`Lista de ${dataBr} aplicada a ${grupos.size} colaborador(es). Confira e confirme cada folha.`);
  _folhaCompetencia = comp;
  _listaDia = null;
  _folhasPapelCarregadas = false;
  render();
}

/* ---------- Renderização ---------- */

function folhaTotalDiaHtml(d) {
  const t = folhaMinutosTrabalhados(d.marcacoes);
  if (!folhaMarcacoesValidas(d.marcacoes).length) return '<span class="small-muted">—</span>';
  const alerta = !t.completo
    ? ' <span title="Marcação sem par — confira" style="color:var(--iniciar);">⚠</span>'
    : t.suspeito
      ? ' <span title="Período maior que 16h — confira" style="color:var(--iniciar);">⚠</span>'
      : '';
  return `${folhaFormatarDuracao(t.minutos)}${alerta}`;
}

function folhaConfiancaHtml(d, editavel) {
  const c = d.confianca;
  if (c !== 'baixa' && c !== 'media') return '';
  const cor = c === 'baixa' ? 'var(--iniciar)' : 'var(--desenvolver)';
  const texto = c === 'baixa' ? 'conferir!' : 'conferir';
  const botao = editavel
    ? ` <button class="btn btn-ghost btn-sm" style="padding:0 6px;" title="Marcar como conferido" onclick="folhaConferirDia(${d.dia})">ok</button>`
    : '';
  return `<span style="color:${cor};font-size:12px;font-weight:600;">⚠ ${texto}</span>${botao}`;
}

function folhaResumoHtml() {
  const f = _folhaAberta;
  if (!f) return '';
  const r = folhaResumo(f.dias, folhaJornadaDe(f.colaborador_id), f.competencia);
  const item = (rotulo, valor, destaque) =>
    `<div><div class="small-muted" style="font-size:12px;">${rotulo}</div><div style="font-size:18px;font-weight:600;${destaque || ''}">${valor}</div></div>`;
  const pendencias = [];
  if (r.semRegistro.length) pendencias.push(`${r.semRegistro.length} dia(s) útil(eis) sem marcação`);
  if (r.incompletos.length) pendencias.push(`${r.incompletos.length} com marcação incompleta`);
  if (r.suspeitos.length) pendencias.push(`${r.suspeitos.length} com período maior que 16h`);
  const corSaldo = r.saldoMin < 0 ? 'color:var(--iniciar);' : r.saldoMin > 0 ? 'color:var(--alavancar);' : '';
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;">
      ${item('Dias trabalhados', r.diasTrabalhados)}
      ${item('Horas trabalhadas', folhaFormatarDuracao(r.minutosTrabalhados))}
      ${item('Atrasos', folhaFormatarDuracao(r.atrasoMin))}
      ${item('Horas extras', folhaFormatarDuracao(r.extraMin))}
      ${item('Saldo', folhaFormatarDuracao(r.saldoMin, true), corSaldo)}
      ${item('Faltas', r.faltas)}
    </div>
    ${pendencias.length ? `<div class="small-muted" style="margin-top:10px;color:var(--iniciar);">⚠ Pendências: ${pendencias.join(' · ')}</div>` : ''}
  `;
}

function folhaLinhaHtml(dia, d, colunas, editavel) {
  const comp = _folhaAberta.competencia;
  const dow = folhaDiaDaSemana(comp, dia);
  const fimDeSemana = dow === 0 || dow === 6;
  const marcs = d.marcacoes || [];
  const campos = Array.from(
    { length: colunas },
    (_, i) =>
      `<td><input class="fp-hora" id="fp_m_${dia}_${i}" type="text" inputmode="numeric" maxlength="5" value="${escaparHtml(marcs[i] || '')}" ${editavel ? '' : 'disabled'} onchange="folhaEditarMarcacao(${dia}, ${i}, this.value)"></td>`
  ).join('');
  const tipo = d.tipo || 'trabalhado';
  const opcoes = FOLHA_TIPOS.map(
    ([v, rotulo]) => `<option value="${v}" ${v === tipo ? 'selected' : ''}>${rotulo}</option>`
  ).join('');
  const fundo =
    d.confianca === 'baixa'
      ? 'background:#fef2f2;'
      : d.confianca === 'media'
        ? 'background:#fffbeb;'
        : fimDeSemana
          ? 'background:var(--surface-2);'
          : '';
  return `<tr style="${fundo}">
    <td style="white-space:nowrap;"><b>${String(dia).padStart(2, '0')}</b> <span class="small-muted">${FOLHA_DIAS_SEMANA[dow]}</span></td>
    <td><select style="max-width:118px;" ${editavel ? '' : 'disabled'} onchange="folhaEditarTipo(${dia}, this.value)">${opcoes}</select></td>
    ${campos}
    <td id="fp_tot_${dia}" style="white-space:nowrap;">${folhaTotalDiaHtml(d)}</td>
    <td><input type="text" maxlength="120" style="min-width:120px;" value="${escaparHtml(d.observacao || '')}" ${editavel ? '' : 'disabled'} onchange="folhaEditarObs(${dia}, this.value)"></td>
    <td id="fp_conf_${dia}" style="white-space:nowrap;">${folhaConfiancaHtml(d, editavel)}</td>
  </tr>`;
}

function renderEditorFolha() {
  const f = _folhaAberta;
  const editavel = f.status !== 'confirmada';
  const n = folhaDiasDoMes(f.competencia);
  const porDia = {};
  f.dias.forEach((d) => (porDia[d.dia] = d));
  const colunas = Math.min(8, Math.max(4, ...f.dias.map((d) => (d.marcacoes || []).length)));
  const cabecalhosMarcacao = Array.from(
    { length: colunas },
    (_, i) => `<th>${i % 2 === 0 ? 'Ent.' : 'Saí.'} ${Math.floor(i / 2) + 1}</th>`
  ).join('');
  const linhas = Array.from({ length: n }, (_, i) =>
    folhaLinhaHtml(i + 1, porDia[i + 1] || { dia: i + 1 }, colunas, editavel)
  ).join('');

  return `
    <div class="page-head">
      <div class="eyebrow">Ponto</div>
      <h1>${escaparHtml(f.colaborador_nome)} <small>${folhaRotuloCompetencia(f.competencia)}</small></h1>
      <p class="page-desc">
        <span class="pill ${f.status === 'confirmada' ? 'pill-alavancar' : 'pill-neutral'}">${f.status === 'confirmada' ? 'Confirmada' : 'Rascunho'}</span>
        ${f.status === 'confirmada' && f.confirmada_em ? `<span class="small-muted"> em ${new Date(f.confirmada_em).toLocaleDateString('pt-BR')}</span>` : ''}
      </p>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <button class="btn btn-ghost btn-sm" onclick="folhaFechar()">← Voltar à lista</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${
            editavel
              ? `<label class="btn btn-primary btn-sm" style="cursor:pointer;${_folhaProcessando ? 'opacity:.6;pointer-events:none;' : ''}">
                  ${_folhaProcessando ? 'Lendo a foto…' : '📷 Enviar foto da folha'}
                  <input type="file" accept="image/*" style="display:none;" onchange="folhaLerFoto(this)">
                </label>`
              : ''
          }
          ${f.imagens.map((im, i) => `<button class="btn btn-ghost btn-sm" onclick="folhaVerFoto(${i})">Ver foto ${i + 1}${im.dia ? ` (dia ${im.dia})` : ''}</button>`).join('')}
        </div>
      </div>
      ${
        editavel
          ? `<p class="small-muted" style="margin:10px 0 0;">Dica: se a letra for pequena, fotografe uma metade da folha por vez (dias 1–16, depois 17–31) — as leituras se somam. A foto é enviada a um serviço de IA (Anthropic) só para transcrição e fica guardada de forma privada.</p>`
          : ''
      }
    </div>

    ${
      _folhaAvisos.length
        ? `<div class="card" style="border-left:3px solid var(--desenvolver);">
        <h3 style="font-size:14px;">Atenção na leitura</h3>
        <ul style="margin:6px 0 0 18px;">${_folhaAvisos.map((a) => `<li>${escaparHtml(a)}</li>`).join('')}</ul>
      </div>`
        : ''
    }

    <div class="card"><h3>Resumo do mês</h3><div id="fp_resumo">${folhaResumoHtml()}</div></div>

    <div class="card">
      <h3>Dia a dia <small>${editavel ? 'a leitura é uma sugestão — confira cada linha; dias destacados merecem atenção' : 'folha confirmada (somente leitura)'}</small></h3>
      <div style="overflow-x:auto;">
        <table class="fp-tabela">
          <thead><tr><th>Dia</th><th>Tipo</th>${cabecalhosMarcacao}<th>Total</th><th>Observação</th><th>Leitura</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        ${editavel ? `<button class="btn" onclick="folhaSalvarRascunho()">Salvar rascunho</button><button class="btn btn-primary" onclick="folhaConfirmar()">Confirmar folha</button>` : `<button class="btn btn-ghost" onclick="folhaReabrir()">Reabrir folha</button>`}
        <button class="btn btn-ghost" onclick="folhaExportarPdf()">Exportar PDF</button>
        ${editavel && f.id ? `<button class="btn btn-ghost" style="color:var(--iniciar);" onclick="folhaExcluirRascunho()">Excluir rascunho</button>` : ''}
      </div>
    </div>
  `;
}

function folhaListaDiaLinhaHtml(l, i, colunas, ativos, duplicados) {
  const sit = folhaListaDiaSituacaoDe(l);
  const bloqueado = sit.tipo === 'bloqueado';
  const temHorario = folhaMesclarMarcacoes([], l.marcacoes).length > 0;
  const incerto = l.nivel === 'provavel' || l.nivel === 'ambiguo' || l.nivel === 'nenhum';
  // vermelho: leitura ruim ou sem colaborador escolhido; amarelo: leitura duvidosa ou nome só "provável"
  let fundo = '';
  if (l.confianca === 'baixa' || !l.colaboradorId) fundo = 'background:#fef2f2;';
  else if (l.confianca === 'media' || incerto) fundo = 'background:#fffbeb;';
  const sugeridos = new Set(l.candidatos);
  const opcoes = [
    `<option value="">— ignorar este nome —</option>`,
    ...ativos
      .filter((c) => sugeridos.has(c.id))
      .map(
        (c) =>
          `<option value="${escaparHtml(c.id)}" ${c.id === l.colaboradorId ? 'selected' : ''}>★ ${escaparHtml(c.nome)}</option>`
      ),
    ...ativos
      .filter((c) => !sugeridos.has(c.id))
      .map(
        (c) =>
          `<option value="${escaparHtml(c.id)}" ${c.id === l.colaboradorId ? 'selected' : ''}>${escaparHtml(c.nome)}</option>`
      ),
  ].join('');
  const rotuloNivel =
    { exato: '', provavel: 'parece ser', ambiguo: 'mais de um possível', nenhum: 'não identificado' }[l.nivel] || '';
  const campos = Array.from(
    { length: colunas },
    (_, k) =>
      `<td><input class="fp-hora" id="ld_m_${i}_${k}" type="text" inputmode="numeric" maxlength="5" value="${escaparHtml(l.marcacoes[k] || '')}" onchange="folhaListaDiaEditarMarcacao(${i}, ${k}, this.value)"></td>`
  ).join('');

  let situacao;
  if (sit.tipo === 'sem_colaborador') situacao = '<span style="color:var(--iniciar);">escolha o colaborador</span>';
  else if (sit.tipo === 'sem_data') situacao = '<span class="small-muted">informe a data</span>';
  else if (bloqueado) situacao = '<span style="color:var(--iniciar);">folha confirmada — reabra antes</span>';
  else if (sit.tipo === 'existente') {
    situacao = `<span class="small-muted">já tem ${sit.atuais.join(' · ')}</span>
      <select style="max-width:110px;" onchange="folhaListaDiaModo(${i}, this.value)">
        <option value="somar" ${l.modo === 'somar' ? 'selected' : ''}>Somar</option>
        <option value="substituir" ${l.modo === 'substituir' ? 'selected' : ''}>Substituir</option>
      </select>`;
  } else situacao = '<span class="small-muted">novo</span>';
  if (l.colaboradorId && duplicados.has(l.colaboradorId))
    situacao +=
      '<div style="color:var(--desenvolver);font-size:12px;">⚠ outro nome da lista aponta pra este colaborador (serão somados)</div>';

  const podeMarcar = !!l.colaboradorId && temHorario && !bloqueado;
  return `<tr style="${fundo}">
    <td><input type="checkbox" ${l.aplicar && podeMarcar ? 'checked' : ''} ${podeMarcar ? '' : 'disabled'} onchange="folhaListaDiaToggle(${i}, this.checked)"></td>
    <td style="min-width:150px;"><b>${escaparHtml(l.nomeLido)}</b>
      ${rotuloNivel ? `<div class="small-muted" style="font-size:12px;">${rotuloNivel}</div>` : ''}
      ${l.confianca === 'baixa' || l.confianca === 'media' ? `<div style="font-size:12px;color:${l.confianca === 'baixa' ? 'var(--iniciar)' : 'var(--desenvolver)'};">⚠ conferir leitura <button class="btn btn-ghost btn-sm" style="padding:0 6px;" onclick="folhaListaDiaConferir(${i})">ok</button></div>` : ''}
      ${l.observacao ? `<div class="small-muted" style="font-size:12px;">${escaparHtml(l.observacao)}</div>` : ''}
    </td>
    <td style="min-width:200px;"><select style="max-width:240px;" onchange="folhaListaDiaTrocarColab(${i}, this.value)">${opcoes}</select></td>
    ${campos}
    <td id="ld_tot_${i}" style="white-space:nowrap;">${folhaListaDiaTotalHtml(l)}</td>
    <td style="min-width:150px;">${situacao}</td>
  </tr>`;
}

function renderListaDia() {
  const L = _listaDia;
  const colunas = Math.min(8, Math.max(4, ...L.linhas.map((l) => l.marcacoes.length)));
  const ativos = (state.colaboradores || [])
    .filter((c) => !c.inativo)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const contagem = {};
  L.linhas.forEach((l) => {
    if (l.colaboradorId) contagem[l.colaboradorId] = (contagem[l.colaboradorId] || 0) + 1;
  });
  const duplicados = new Set(Object.keys(contagem).filter((k) => contagem[k] > 1));
  const identificados = L.linhas.filter((l) => l.colaboradorId).length;

  const dia = folhaListaDiaDia();
  let notaData = '';
  if (dia !== null) {
    const [ano, mes] = L.data.split('-').map(Number);
    const dow = new Date(ano, mes - 1, dia).getDay();
    notaData = `<span class="small-muted">${FOLHA_DIAS_SEMANA[dow]} · competência ${folhaRotuloCompetencia(L.data.slice(0, 7))}</span>`;
    if (dow === 0 || dow === 6)
      notaData +=
        ' <span style="color:var(--desenvolver);font-size:12px;">⚠ cai num fim de semana — confira a data</span>';
  }

  return `
    <div class="page-head">
      <div class="eyebrow">Ponto</div>
      <h1>Lista de presença do dia</h1>
      <p class="page-desc">Uma folha com o nome e a hora de vários colaboradores. O sistema lê a data e os horários, sugere quem é cada nome, você confere — e cada pessoa recebe esse dia na folha do mês dela.</p>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <button class="btn btn-ghost btn-sm" onclick="folhaListaDiaFechar()">← Voltar à lista</button>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;${L.lendo ? 'opacity:.6;pointer-events:none;' : ''}">
          ${L.lendo ? 'Lendo a foto…' : L.path ? '📷 Trocar foto' : '📷 Enviar foto da lista'}
          <input type="file" accept="image/*" style="display:none;" onchange="folhaListaDiaLerFoto(this)">
        </label>
      </div>
      <p class="small-muted" style="margin:10px 0 0;">Fotografe a folha inteira, bem enquadrada e com boa luz. Se a lista for longa ou a letra pequena, importe uma parte de cada vez — os horários do mesmo dia se somam. O 1º horário de cada pessoa é entrada, o 2º saída, e assim por diante (pela ordem do relógio). A foto é enviada a um serviço de IA (Anthropic) só para transcrição e fica guardada de forma privada.</p>
    </div>

    ${
      !L.path
        ? '<div class="empty">Envie a foto da lista de presença para começar.</div>'
        : `
      ${
        L.avisos.length
          ? `<div class="card" style="border-left:3px solid var(--desenvolver);"><h3 style="font-size:14px;">Atenção na leitura</h3><ul style="margin:6px 0 0 18px;">${L.avisos.map((a) => `<li>${escaparHtml(a)}</li>`).join('')}</ul></div>`
          : ''
      }
      <div class="card">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="field" style="margin:0;"><label>Data da folha</label><input type="date" value="${escaparHtml(L.data)}" onchange="folhaListaDiaMudarData(this.value)"></div>
          <div>${notaData}</div>
          <div class="small-muted" style="margin-left:auto;">${L.linhas.length} nome(s) lido(s) · ${identificados} identificado(s)</div>
        </div>
      </div>
      <div class="card">
        <h3>Quem é quem <small>a leitura e a sugestão de nome são só um palpite — confira cada linha; destacadas merecem atenção</small></h3>
        ${
          L.linhas.length
            ? `<div style="overflow-x:auto;"><table class="fp-tabela">
          <thead><tr><th></th><th>Nome na folha</th><th>Colaborador</th>${Array.from({ length: colunas }, (_, k) => `<th>${k % 2 === 0 ? 'Ent.' : 'Saí.'} ${Math.floor(k / 2) + 1}</th>`).join('')}<th>Total</th><th>Situação</th></tr></thead>
          <tbody>${L.linhas.map((l, i) => folhaListaDiaLinhaHtml(l, i, colunas, ativos, duplicados)).join('')}</tbody></table></div>`
            : '<div class="empty">Nenhum nome reconhecido.</div>'
        }
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
          <button class="btn btn-primary" id="ld_btn_aplicar" onclick="folhaListaDiaAplicar()">Aplicar às folhas (${folhaListaDiaAplicaveis().length})</button>
          <button class="btn btn-ghost" onclick="folhaListaDiaFechar()">Cancelar</button>
        </div>
        <p class="small-muted" style="margin:10px 0 0;">Aplicar não confirma nada: cada folha entra como <b>rascunho</b> e você ainda confere e confirma uma a uma.</p>
      </div>`
    }
  `;
}

function renderListaFolhas() {
  const comFolha = new Set(_folhasPapel.map((f) => f.colaborador_id));
  const disponiveis = (state.colaboradores || [])
    .filter((c) => !c.inativo && !comFolha.has(c.id))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  const linhas = _folhasPapel
    .map((f) => {
      const r = folhaResumo(f.dias, folhaJornadaDe(f.colaborador_id), f.competencia);
      const pend = r.semRegistro.length + r.incompletos.length + r.suspeitos.length;
      return `<tr>
        <td><b>${escaparHtml(f.colaborador_nome)}</b></td>
        <td><span class="pill ${f.status === 'confirmada' ? 'pill-alavancar' : 'pill-neutral'}">${f.status === 'confirmada' ? 'Confirmada' : 'Rascunho'}</span></td>
        <td>${r.diasTrabalhados}</td>
        <td>${folhaFormatarDuracao(r.minutosTrabalhados)}</td>
        <td>${folhaFormatarDuracao(r.atrasoMin)}</td>
        <td>${folhaFormatarDuracao(r.extraMin)}</td>
        <td style="${r.saldoMin < 0 ? 'color:var(--iniciar);' : ''}">${folhaFormatarDuracao(r.saldoMin, true)}</td>
        <td>${r.faltas}</td>
        <td>${pend ? `<span style="color:var(--iniciar);">⚠ ${pend}</span>` : '<span class="small-muted">—</span>'}</td>
        <td style="text-align:right;"><button class="btn btn-sm btn-ghost" onclick="folhaAbrir('${escaparParaOnclick(f.colaborador_id)}')">Abrir</button></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card">
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>Competência</label><input type="month" value="${_folhaCompetencia}" onchange="folhaMudarCompetencia(this.value)"></div>
        <div class="field" style="margin:0;min-width:220px;"><label>Nova folha</label>
          <select id="fp_nova_colab" onchange="_folhaNovaColabId=this.value;">
            <option value="">Escolha o colaborador…</option>
            ${disponiveis.map((c) => `<option value="${escaparHtml(c.id)}" ${c.id === _folhaNovaColabId ? 'selected' : ''}>${escaparHtml(c.nome)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="folhaAbrir(document.getElementById('fp_nova_colab').value)">Abrir folha</button>
        <button class="btn btn-ghost" style="margin-left:auto;" onclick="folhaExportarConsolidado()">Exportar Excel do mês</button>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;">Lista de presença do dia</h3>
          <p class="small-muted" style="margin:4px 0 0;">Uma folha só, com o nome e a hora de vários colaboradores (o mesmo nome aparece na entrada e na saída).</p>
        </div>
        <button class="btn btn-primary" onclick="folhaListaDiaAbrir()">📋 Importar lista do dia</button>
      </div>
    </div>

    <div class="card">
      <h3>Folhas de ${folhaRotuloCompetencia(_folhaCompetencia)} <small>${_folhasPapel.length} folha(s)</small></h3>
      ${
        !_folhasPapelCarregadas
          ? '<div class="empty">Carregando…</div>'
          : _folhasPapel.length
            ? `<div style="overflow-x:auto;"><table>
            <thead><tr><th>Colaborador</th><th>Situação</th><th>Dias</th><th>Horas</th><th>Atrasos</th><th>Extras</th><th>Saldo</th><th>Faltas</th><th>Pendências</th><th></th></tr></thead>
            <tbody>${linhas}</tbody></table></div>`
            : '<div class="empty">Nenhuma folha neste mês ainda. Escolha um colaborador acima e envie a foto da folha de ponto dele.</div>'
      }
    </div>
  `;
}

function pageFolhaPapel() {
  if (!_folhaCompetencia) _folhaCompetencia = folhaCompetenciaAtual();
  if (!_folhasPapelCarregadas && !_folhasPapelCarregando) carregarFolhasPapel();
  if (_listaDia) return renderListaDia();
  if (_folhaAberta) return renderEditorFolha();
  return `
    <div class="page-head">
      <div class="eyebrow">Ponto</div>
      <h1>Folha de ponto em papel</h1>
      <p class="page-desc">Para quem ainda registra o ponto à mão: fotografe a folha, o sistema lê os horários, você confere e confirma — e saem os totais e relatórios do mês.</p>
    </div>
    <div class="notice info" style="margin-bottom:12px;">A leitura é feita por IA e <b>pode errar</b> (letra de mão, rasuras). Por isso nada vale até você conferir cada dia e confirmar — a foto original fica guardada como comprovante.</div>
    ${renderListaFolhas()}
  `;
}
