/* =========================================================
   R&S — PROVAS DE CONHECIMENTO (processo seletivo)
   -----------------------------------------------------------
   O RH (Administrador e RH) monta provas de múltipla escolha com nota automática, aplica a um
   candidato do funil e acompanha o resultado. O candidato recebe um link e faz a prova na página
   pública prova.html (sem login). A correção, o cronômetro e o GABARITO ficam no servidor
   (Edge Function provas-rs) — este arquivo só mostra o que o servidor devolve.

   Princípios:
   - o resultado é APOIO à decisão: a tela nunca diz "reprovado" — diz "atingiu / abaixo da nota mínima";
   - provas de CONHECIMENTO (português, matemática, Excel...). Testes psicológicos são privativos de
     psicólogos e exigem instrumentos próprios — não são o objetivo deste recurso;
   - abrir o resultado de um candidato fica na Auditoria.

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

// Os MESMOS limites da função provas-rs (um teste confere que não saem de sincronia).
const PROVA_LIMITES = {
  questoes: 60,
  alternativasMin: 2,
  alternativasMax: 6,
  titulo: 120,
  descricao: 1000,
  enunciado: 1000,
  alternativa: 300,
  pesoMax: 10,
  tempoMin: 5,
  tempoMax: 240,
};

function provasHabilitadasRS() {
  return ['owner', 'rh'].includes(meuPapelReal);
}

/* ---------- Modelos prontos ---------- */
// q(enunciado, [alternativas], índiceDaCorreta, peso?) — as alternativas viram ids ao carregar no editor.
const _pq = (enunciado, alternativas, correta, peso = 1) => ({ enunciado, alternativas, correta, peso });

const PROVAS_MODELOS = [
  {
    chave: 'portugues',
    titulo: 'Português básico',
    descricao: 'Ortografia, concordância, crase, pontuação e interpretação de texto no dia a dia de trabalho.',
    tempo_limite_min: 20,
    nota_minima: 60,
    questoes: [
      _pq(
        'Qual frase está escrita corretamente?',
        [
          'Haviam muitos problemas na reunião.',
          'Houveram muitos problemas na reunião.',
          'Houve muitos problemas na reunião.',
          'Houvessem muitos problemas na reunião.',
        ],
        2
      ),
      _pq('Qual palavra está escrita corretamente?', ['excessão', 'exceção', 'esceção', 'ecxeção'], 1),
      _pq(
        'Escolha a frase correta quanto à concordância:',
        [
          'Fazem dois anos que ele trabalha aqui.',
          'Faz dois anos que ele trabalha aqui.',
          'Fazia dois anos que ele trabalha aqui.',
          'Fazem-se dois anos que ele trabalha aqui.',
        ],
        1
      ),
      _pq(
        'Em qual frase o acento indicativo de crase está correto?',
        ['Vou à pé para casa.', 'Cheguei à tempo na reunião.', 'Vou à escola agora.', 'Entreguei o documento à ele.'],
        2
      ),
      _pq(
        'Em qual frase a vírgula está empregada corretamente?',
        [
          'A equipe, finalizou o relatório.',
          'Ontem, a equipe finalizou o relatório.',
          'A equipe finalizou, o relatório.',
          'A equipe finalizou o relatório,',
        ],
        1
      ),
      _pq('Complete: "____ você não respondeu o e-mail do cliente?"', ['Porque', 'Porquê', 'Por que', 'Por quê?'], 2),
      _pq('Complete: "Ele se sente ____ quando chega atrasado."', ['mau', 'mal', 'maus', 'mals'], 1),
      _pq(
        'Leia: "Prezado cliente, informamos que o atendimento será encerrado às 18h. Pedidos feitos após esse horário serão processados no próximo dia útil." Um pedido feito às 19h será processado:',
        ['No mesmo dia, às 19h.', 'Às 18h do mesmo dia.', 'No próximo dia útil.', 'Não será processado.'],
        2
      ),
      _pq(
        'Qual é a forma mais adequada de iniciar um e-mail formal a um cliente que você não conhece?',
        ['E aí, tudo bem?', 'Prezado(a) senhor(a),', 'Fala, cliente!', 'Oi pessoal,'],
        1
      ),
      _pq(
        'Qual alternativa traz o plural correto?',
        ['Os cidadões votaram.', 'Os cidadães votaram.', 'Os cidadãos votaram.', 'Os cidadams votaram.'],
        2
      ),
    ],
  },
  {
    chave: 'matematica',
    titulo: 'Matemática básica',
    descricao: 'Porcentagem, regra de três, média, juros simples e problemas do dia a dia.',
    tempo_limite_min: 25,
    nota_minima: 60,
    questoes: [
      _pq('Quanto é 15% de 200?', ['20', '30', '40', '45'], 1),
      _pq('Se 3 canetas custam R$ 6, quanto custam 5 canetas?', ['R$ 8', 'R$ 10', 'R$ 12', 'R$ 15'], 1),
      _pq('Qual é a média de 4, 6 e 8?', ['5', '6', '7', '8'], 1),
      _pq('Um produto de R$ 80 recebe 25% de desconto. Qual é o preço final?', ['R$ 55', 'R$ 60', 'R$ 65', 'R$ 70'], 1),
      _pq('Quanto é 3/4 de 120?', ['80', '85', '90', '95'], 2),
      _pq(
        'R$ 1.000 aplicados a juros simples de 2% ao mês, por 3 meses, rendem quanto de juros?',
        ['R$ 20', 'R$ 60', 'R$ 600', 'R$ 1.060'],
        1
      ),
      _pq(
        'Um salário de R$ 2.000 teve aumento de 10%. Qual é o novo salário?',
        ['R$ 2.010', 'R$ 2.100', 'R$ 2.200', 'R$ 2.020'],
        2
      ),
      _pq('Uma loja vende 12 unidades por dia. Em 15 dias, quantas unidades vende?', ['150', '160', '170', '180'], 3),
      _pq('Se 2x + 6 = 20, quanto vale x?', ['5', '6', '7', '13'], 2),
      _pq(
        'Em uma turma de 40 alunos, 10 faltaram. Qual é a porcentagem de alunos presentes?',
        ['25%', '60%', '70%', '75%'],
        3
      ),
    ],
  },
  {
    chave: 'excel',
    titulo: 'Excel básico',
    descricao: 'Fórmulas e recursos mais usados em planilhas no trabalho administrativo.',
    tempo_limite_min: 20,
    nota_minima: 60,
    questoes: [
      _pq(
        'Qual fórmula soma os valores das células de A1 até A10?',
        ['=SOMA(A1;A10)', '=SOMA(A1:A10)', '=A1+A10', '=TOTAL(A1:A10)'],
        1
      ),
      _pq(
        'Qual função retorna a média dos valores do intervalo B1:B5?',
        ['=MEDIANA(B1:B5)', '=MODO(B1:B5)', '=MÉDIA(B1:B5)', '=MÉDIA(B1;B5)'],
        2
      ),
      _pq(
        'Na referência $A$1, o que os cifrões fazem?',
        [
          'Formatam a célula como moeda.',
          'Fixam a referência da célula ao copiar a fórmula.',
          'Somam o valor da célula A1.',
          'Protegem a célula contra edição.',
        ],
        1
      ),
      _pq(
        'Qual fórmula mostra "Aprovado" se C2 for maior ou igual a 7 e "Reprovado" caso contrário?',
        [
          '=SE(C2>=7;"Reprovado";"Aprovado")',
          '=SE(C2<=7;"Aprovado";"Reprovado")',
          '=SE(C2>=7;"Aprovado";"Reprovado")',
          '=SE(C2=7;"Aprovado")',
        ],
        2
      ),
      _pq('Qual atalho de teclado desfaz a última ação?', ['Ctrl + Y', 'Ctrl + Z', 'Ctrl + X', 'Ctrl + D'], 1),
      _pq(
        'Qual função conta quantas células do intervalo A1:A20 contêm números?',
        ['=CONT.NÚM(A1:A20)', '=SOMA(A1:A20)', '=MÁXIMO(A1:A20)', '=MÉDIA(A1:A20)'],
        0
      ),
      _pq(
        'Qual função devolve o maior valor de um intervalo?',
        ['=MÍNIMO()', '=MÁXIMO()', '=MÉDIA()', '=MAIOR.NOME()'],
        1
      ),
      _pq(
        'O que significa o erro #DIV/0! em uma célula?',
        [
          'A fórmula tentou dividir por zero.',
          'A célula está protegida.',
          'O arquivo está corrompido.',
          'A coluna ficou estreita demais.',
        ],
        0
      ),
      _pq(
        'Para mostrar apenas as linhas que atendem a um critério (por exemplo, só os clientes de Teresina), qual recurso se usa?',
        ['Filtro', 'Proteger planilha', 'Validação de dados', 'Congelar painéis'],
        0
      ),
      _pq(
        'Qual função procura um valor na primeira coluna de uma tabela e devolve outro valor da mesma linha?',
        ['SOMASE', 'PROCV', 'ARRUMAR', 'TRUNCAR'],
        1
      ),
    ],
  },
];

/* ---------- Rascunho da prova (o que o editor edita) ---------- */
function provaNovaQuestao() {
  return {
    enunciado: '',
    peso: 1,
    correta: '',
    alternativas: [
      { id: uid(), texto: '' },
      { id: uid(), texto: '' },
    ],
  };
}
function provaRascunhoNovo() {
  return { id: null, titulo: '', descricao: '', tempo_limite_min: 30, nota_minima: 60, questoes: [provaNovaQuestao()] };
}
function provaRascunhoDoModelo(modelo) {
  return {
    id: null,
    titulo: modelo.titulo,
    descricao: modelo.descricao,
    tempo_limite_min: modelo.tempo_limite_min,
    nota_minima: modelo.nota_minima,
    questoes: modelo.questoes.map((q) => {
      const alternativas = q.alternativas.map((texto) => ({ id: uid(), texto }));
      return { enunciado: q.enunciado, peso: q.peso || 1, correta: alternativas[q.correta].id, alternativas };
    }),
  };
}
function provaRascunhoDaProva(p) {
  return JSON.parse(
    JSON.stringify({
      id: p.id,
      titulo: p.titulo,
      descricao: p.descricao || '',
      tempo_limite_min: p.tempo_limite_min,
      nota_minima: Number(p.nota_minima),
      questoes: p.questoes,
    })
  );
}
function provaRascunhoDuplicado(p) {
  const r = provaRascunhoDaProva(p);
  r.id = null;
  r.titulo = `${p.titulo} (cópia)`.slice(0, PROVA_LIMITES.titulo);
  return r;
}

// Mesmas regras do servidor (que sempre revalida): o RH vê o erro antes de enviar.
// Devolve '' se está tudo certo, ou a primeira mensagem de erro.
function provaValidarRascunho(r) {
  const L = PROVA_LIMITES;
  const titulo = String(r.titulo || '').trim();
  if (titulo.length < 3 || titulo.length > L.titulo) return `O título precisa ter de 3 a ${L.titulo} caracteres.`;
  if (String(r.descricao || '').trim().length > L.descricao) return `A descrição passa de ${L.descricao} caracteres.`;
  const tempo = Number(r.tempo_limite_min);
  if (!Number.isInteger(tempo) || tempo < L.tempoMin || tempo > L.tempoMax)
    return `O tempo limite precisa ser um número inteiro de ${L.tempoMin} a ${L.tempoMax} minutos.`;
  const nota =
    r.nota_minima === '' || r.nota_minima === null || r.nota_minima === undefined ? 60 : Number(r.nota_minima);
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) return 'A nota mínima precisa estar entre 0 e 100.';
  const qs = r.questoes || [];
  if (qs.length < 1) return 'Adicione pelo menos uma questão.';
  if (qs.length > L.questoes) return `Uma prova pode ter no máximo ${L.questoes} questões.`;
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const n = i + 1;
    const enun = String(q.enunciado || '').trim();
    if (enun.length < 5 || enun.length > L.enunciado)
      return `Questão ${n}: o enunciado precisa ter de 5 a ${L.enunciado} caracteres.`;
    const alts = q.alternativas || [];
    if (alts.length < L.alternativasMin || alts.length > L.alternativasMax)
      return `Questão ${n}: use de ${L.alternativasMin} a ${L.alternativasMax} alternativas.`;
    const textos = alts.map((a) => String(a.texto || '').trim());
    if (textos.some((t) => t.length < 1 || t.length > L.alternativa))
      return `Questão ${n}: cada alternativa precisa ter de 1 a ${L.alternativa} caracteres.`;
    if (new Set(textos.map((t) => t.toLowerCase())).size !== textos.length)
      return `Questão ${n}: há alternativas repetidas.`;
    if (!alts.some((a) => a.id === q.correta)) return `Questão ${n}: marque qual alternativa é a correta.`;
    const peso = q.peso === '' || q.peso === null || q.peso === undefined ? 1 : Number(q.peso);
    if (!Number.isInteger(peso) || peso < 1 || peso > L.pesoMax)
      return `Questão ${n}: o peso precisa ser um número inteiro de 1 a ${L.pesoMax}.`;
  }
  return '';
}

/* ---------- Texto dos resultados ---------- */
const PROVA_STATUS_ROTULO = {
  enviada: 'Aguardando o candidato',
  iniciada: 'Em andamento',
  concluida: 'Concluída',
  expirada: 'Link expirado',
  cancelada: 'Cancelada',
};
function provaStatusRotulo(status) {
  return PROVA_STATUS_ROTULO[status] || status;
}
function provaNotaTexto(nota) {
  return nota === null || nota === undefined
    ? '—'
    : `${Number(nota).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}
function provaDuracaoTexto(seg) {
  if (seg === null || seg === undefined) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m > 0 ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`;
}
// Linha de resumo do resultado — nunca "reprovado": só se atingiu ou não a nota mínima que a própria empresa definiu.
function provaResultadoTexto(a) {
  if (a.status !== 'concluida' || a.nota === null || a.nota === undefined) return provaStatusRotulo(a.status);
  return `${provaNotaTexto(a.nota)} — ${a.atingiu_minima ? 'atingiu' : 'abaixo da'} nota mínima (${provaNotaTexto(a.nota_minima)})`;
}

/* ---------- Estado e carregamento ---------- */
let _provas = [];
let _provasCarregadas = false;
let _provasCarregando = false;
let _provasErro = '';
let _aplicacoes = [];
let _aplicacoesCarregadas = false;
let _aplicacoesCarregando = false;
let _provaAba = 'provas'; // 'provas' | 'resultados'
let _provaEditor = null; // rascunho em edição
let _provaDetalhe = null; // { aplicacao, questoes } aberto
let _provaAplicando = null; // id do candidato (funil) que está recebendo uma prova agora
let _provaUltimoLink = null; // { candidatoId, link, emailEnviado, nome }
let _provaFiltroStatus = '';
let _provaFiltroProva = '';
let _provaOcupada = false;

async function _provaChamar(action, extra) {
  const { data, error } = await sb.functions.invoke('provas-rs', { body: { action, ...(extra || {}) } });
  if (error || !data || data.error)
    throw new Error(await mensagemDeErroFuncao(error, data, 'Não foi possível concluir agora. Tente novamente.'));
  return data;
}

async function carregarProvas() {
  if (_provasCarregando) return;
  _provasCarregando = true;
  _provasErro = '';
  try {
    _provas = (await _provaChamar('prova_listar')).provas || [];
  } catch (e) {
    _provasErro = e.message;
    _provas = [];
  }
  _provasCarregando = false;
  _provasCarregadas = true;
  render();
}

async function carregarAplicacoesProvas() {
  if (_aplicacoesCarregando) return;
  _aplicacoesCarregando = true;
  try {
    _aplicacoes = (await _provaChamar('aplicacao_listar')).aplicacoes || [];
  } catch (e) {
    _aplicacoes = [];
  }
  _aplicacoesCarregando = false;
  _aplicacoesCarregadas = true;
  render();
}
function _provaRecarregarTudo() {
  _provasCarregadas = false;
  _aplicacoesCarregadas = false;
}

/* ---------- Editor ---------- */
function provaNovaProva() {
  _provaEditor = provaRascunhoNovo();
  _provaAba = 'provas';
  render();
}
function provaUsarModelo(chave) {
  const m = PROVAS_MODELOS.find((x) => x.chave === chave);
  if (!m) return;
  _provaEditor = provaRascunhoDoModelo(m);
  _provaAba = 'provas';
  render();
}
function provaEditarProva(id) {
  const p = _provas.find((x) => x.id === id);
  if (!p) return;
  _provaEditor = provaRascunhoDaProva(p);
  _provaAba = 'provas';
  render();
}
function provaDuplicarProva(id) {
  const p = _provas.find((x) => x.id === id);
  if (!p) return;
  _provaEditor = provaRascunhoDuplicado(p);
  render();
}
function provaCancelarEdicao() {
  _provaEditor = null;
  render();
}

// Lê o que está digitado na tela pra dentro do rascunho (antes de qualquer ação que refaz a tela).
function provaEditorLerTela() {
  if (!_provaEditor) return;
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : undefined;
  };
  const r = _provaEditor;
  if (val('pv_titulo') !== undefined) r.titulo = val('pv_titulo');
  if (val('pv_desc') !== undefined) r.descricao = val('pv_desc');
  if (val('pv_tempo') !== undefined) r.tempo_limite_min = val('pv_tempo') === '' ? '' : Number(val('pv_tempo'));
  if (val('pv_nota') !== undefined) r.nota_minima = val('pv_nota') === '' ? '' : Number(val('pv_nota'));
  r.questoes.forEach((q, i) => {
    if (val(`pv_q${i}_enun`) !== undefined) q.enunciado = val(`pv_q${i}_enun`);
    if (val(`pv_q${i}_peso`) !== undefined) q.peso = val(`pv_q${i}_peso`) === '' ? '' : Number(val(`pv_q${i}_peso`));
    q.alternativas.forEach((a, j) => {
      if (val(`pv_q${i}_a${j}`) !== undefined) a.texto = val(`pv_q${i}_a${j}`);
    });
    const marcada = document.querySelector(`input[name="pv_q${i}_ok"]:checked`);
    if (marcada) q.correta = marcada.value;
  });
}
function provaEditorAddQuestao() {
  provaEditorLerTela();
  if (_provaEditor.questoes.length >= PROVA_LIMITES.questoes)
    return showToast(`Máximo de ${PROVA_LIMITES.questoes} questões por prova.`);
  _provaEditor.questoes.push(provaNovaQuestao());
  render();
}
function provaEditorRemoverQuestao(i) {
  provaEditorLerTela();
  if (_provaEditor.questoes.length <= 1) return showToast('A prova precisa de pelo menos uma questão.');
  _provaEditor.questoes.splice(i, 1);
  render();
}
function provaEditorMoverQuestao(i, delta) {
  provaEditorLerTela();
  const qs = _provaEditor.questoes;
  const j = i + delta;
  if (j < 0 || j >= qs.length) return;
  [qs[i], qs[j]] = [qs[j], qs[i]];
  render();
}
function provaEditorAddAlternativa(i) {
  provaEditorLerTela();
  const q = _provaEditor.questoes[i];
  if (q.alternativas.length >= PROVA_LIMITES.alternativasMax)
    return showToast(`Máximo de ${PROVA_LIMITES.alternativasMax} alternativas por questão.`);
  q.alternativas.push({ id: uid(), texto: '' });
  render();
}
function provaEditorRemoverAlternativa(i, j) {
  provaEditorLerTela();
  const q = _provaEditor.questoes[i];
  if (q.alternativas.length <= PROVA_LIMITES.alternativasMin)
    return showToast(`Use pelo menos ${PROVA_LIMITES.alternativasMin} alternativas.`);
  const [removida] = q.alternativas.splice(j, 1);
  if (q.correta === removida.id) q.correta = '';
  render();
}

async function provaEditorSalvar() {
  if (_provaOcupada) return;
  provaEditorLerTela();
  const erro = provaValidarRascunho(_provaEditor);
  if (erro) return showToast(erro);
  _provaOcupada = true;
  try {
    await _provaChamar('prova_salvar', { id: _provaEditor.id || undefined, prova: _provaEditor });
    showToast('Prova salva.');
    _provaEditor = null;
    _provasCarregadas = false;
  } catch (e) {
    showToast(e.message);
  }
  _provaOcupada = false;
  render();
}

async function provaArquivar(id, arquivar) {
  try {
    await _provaChamar('prova_arquivar', { id, arquivada: arquivar });
    _provasCarregadas = false;
    showToast(arquivar ? 'Prova arquivada.' : 'Prova restaurada.');
  } catch (e) {
    showToast(e.message);
  }
  render();
}
async function provaExcluir(id) {
  const p = _provas.find((x) => x.id === id);
  if (!p) return;
  // Texto puro numa caixa do navegador (não interpreta HTML).
  const tituloParaConfirmar = p.titulo;
  if (
    !confirm(
      `Excluir a prova "${tituloParaConfirmar}"?\n\nOs resultados de candidatos que já fizeram essa prova continuam guardados.`
    )
  )
    return;
  try {
    await _provaChamar('prova_excluir', { id });
    _provasCarregadas = false;
    showToast('Prova excluída.');
  } catch (e) {
    showToast(e.message);
  }
  render();
}

/* ---------- Aplicar a um candidato (painel no funil do R&S) ---------- */
function provaAbrirAplicar(candidatoId) {
  _provaAplicando = _provaAplicando === candidatoId ? null : candidatoId;
  if (!_provasCarregadas && !_provasCarregando) carregarProvas();
  render();
}
function provaFecharAplicar() {
  _provaAplicando = null;
  _provaUltimoLink = null;
  render();
}

function provaPainelAplicarRS(c) {
  if (!provasHabilitadasRS() || _provaAplicando !== c.id) return '';
  const ativas = _provas.filter((p) => !p.arquivada);
  const temEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '');
  const link = _provaUltimoLink && _provaUltimoLink.candidatoId === c.id ? _provaUltimoLink : null;
  return `<div class="card" style="margin-top:10px;background:var(--surface);">
    <h4 style="font-size:13px;margin-bottom:8px;">Aplicar prova a ${escaparHtml(c.nome)}</h4>
    ${
      link
        ? `<div class="notice info">✅ Prova aplicada.${link.emailEnviado ? ' O link foi enviado por e-mail ao candidato.' : ' Envie o link ao candidato (ele é pessoal — não compartilhe).'}
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;"><input type="text" readonly value="${escaparHtml(link.link)}" style="flex:1;min-width:220px;" onclick="this.select()"><button class="btn btn-sm btn-primary" onclick="provaCopiarLink()">Copiar link</button></div>
            <div class="small-muted" style="margin-top:6px;">Por segurança, este link só aparece agora. Se precisar de outro, use "Reenviar link" em Resultados.</div></div>
          <div style="margin-top:8px;"><button class="btn btn-sm btn-ghost" onclick="provaFecharAplicar()">Fechar</button></div>`
        : !_provasCarregadas
          ? '<div class="small-muted">Carregando provas…</div>'
          : !ativas.length
            ? `<div class="empty">Você ainda não tem provas. <button class="btn btn-sm btn-primary" onclick="goto('rs_provas')">Criar uma prova</button></div>`
            : `<div class="grid2">
                <div class="field"><label>Prova</label><select id="pv_ap_prova">${ativas.map((p) => `<option value="${escaparHtml(p.id)}">${escaparHtml(p.titulo)} (${p.questoes.length} questões · ${p.tempo_limite_min} min)</option>`).join('')}</select></div>
                <div class="field"><label>O link vale por</label><select id="pv_ap_dias"><option value="3">3 dias</option><option value="7" selected>7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option></select></div>
              </div>
              <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:10px;"><input type="checkbox" id="pv_ap_email" ${temEmail ? 'checked' : 'disabled'}> Enviar o link por e-mail ao candidato ${temEmail ? '' : '<span class="small-muted">(sem e-mail cadastrado)</span>'}</label>
              <button class="btn btn-sm btn-primary" onclick="provaAplicarConfirmar('${escaparParaOnclick(c.id)}')" ${_provaOcupada ? 'disabled' : ''}>Aplicar prova</button>
              <button class="btn btn-sm btn-ghost" onclick="provaFecharAplicar()">Cancelar</button>
              <div class="small-muted" style="margin-top:8px;">O candidato faz a prova sem login, em uma única tentativa, com o tempo definido na prova. O resultado é apoio à sua decisão — você decide.</div>`
    }
  </div>`;
}

async function provaAplicarConfirmar(candidatoId) {
  if (_provaOcupada) return;
  const c = (state.rs?.candidatos || []).find((x) => x.id === candidatoId);
  if (!c) return;
  const provaId = document.getElementById('pv_ap_prova')?.value;
  const dias = Number(document.getElementById('pv_ap_dias')?.value || 7);
  const enviarEmail = !!document.getElementById('pv_ap_email')?.checked;
  if (!provaId) return showToast('Escolha uma prova.');
  _provaOcupada = true;
  try {
    const r = await _provaChamar('aplicacao_criar', {
      prova_id: provaId,
      candidato_ref: c.id,
      candidato_nome: c.nome,
      candidato_email: c.email || undefined,
      validade_dias: dias,
      enviar_email: enviarEmail,
      url_base: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`,
    });
    registrarAuditoria('rs.prova_aplicada', { aplicacaoId: r.aplicacao.id });
    _provaUltimoLink = { candidatoId: c.id, link: r.link, emailEnviado: r.emailEnviado };
    _aplicacoesCarregadas = false;
  } catch (e) {
    showToast(e.message);
  }
  _provaOcupada = false;
  render();
}
async function provaCopiarLink() {
  if (!_provaUltimoLink) return;
  try {
    await navigator.clipboard.writeText(_provaUltimoLink.link);
    showToast('Link copiado.');
  } catch (e) {
    window.prompt('Copie o link:', _provaUltimoLink.link);
  }
}

/* ---------- Coluna e botão no funil do R&S ---------- */
function provaCabecalhoRS() {
  return provasHabilitadasRS() ? '<th>Prova</th>' : '';
}
function provaChipHtml(a) {
  const cor =
    a.status === 'concluida'
      ? a.atingiu_minima
        ? 'pill-alavancar'
        : 'pill-desenvolver'
      : a.status === 'iniciada'
        ? 'pill-desenvolver'
        : 'pill-neutral';
  const texto =
    a.status === 'concluida'
      ? `${provaNotaTexto(a.nota)} · ${a.prova_titulo}`
      : `${provaStatusRotulo(a.status)} · ${a.prova_titulo}`;
  return `<button class="pill ${cor}" style="cursor:pointer;border:0;margin:0 4px 4px 0;" title="${escaparHtml(provaResultadoTexto(a))}" onclick="provaIrParaResultado('${escaparParaOnclick(a.id)}')">${escaparHtml(texto)}</button>`;
}
function provaCelulaRS(c) {
  if (!provasHabilitadasRS()) return '';
  if (!_aplicacoesCarregadas && !_aplicacoesCarregando) carregarAplicacoesProvas();
  const lista = (_aplicacoes || []).filter((a) => a.candidato_ref === c.id);
  return `<td>${lista.length ? lista.map(provaChipHtml).join('') : '<span class="small-muted">—</span>'}</td>`;
}
function provaBotaoRS(c) {
  if (!provasHabilitadasRS()) return '';
  return `<button class="btn btn-sm btn-ghost" onclick="provaAbrirAplicar('${escaparParaOnclick(c.id)}')">${_provaAplicando === c.id ? 'Fechar prova' : 'Aplicar prova'}</button> `;
}
function provaIrParaResultado(aplicacaoId) {
  _provaAba = 'resultados';
  goto('rs_provas');
  provaVerDetalhe(aplicacaoId);
}

/* ---------- Resultados ---------- */
async function provaVerDetalhe(id) {
  try {
    _provaDetalhe = await _provaChamar('aplicacao_detalhe', { id });
    registrarAuditoria('rs.prova_resultado_visualizado', { aplicacaoId: id });
  } catch (e) {
    showToast(e.message);
  }
  render();
}
function provaFecharDetalhe() {
  _provaDetalhe = null;
  render();
}

async function provaReenviarLink(id) {
  const a = _aplicacoes.find((x) => x.id === id);
  const temEmail = !!(a && a.candidato_email);
  const comEmail =
    temEmail &&
    confirm(
      'Gerar um NOVO link (o anterior deixa de valer) e enviar por e-mail ao candidato?\n\nOK = enviar por e-mail · Cancelar = só gerar o link para eu copiar'
    );
  try {
    const r = await _provaChamar('aplicacao_reenviar', {
      id,
      enviar_email: comEmail,
      url_base: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`,
    });
    registrarAuditoria('rs.prova_link_reenviado', { aplicacaoId: id });
    _aplicacoesCarregadas = false;
    if (comEmail && r.emailEnviado) showToast('Novo link enviado por e-mail.');
    else window.prompt('Novo link (o anterior deixou de valer). Copie e envie ao candidato:', r.link);
  } catch (e) {
    showToast(e.message);
  }
  render();
}
async function provaCancelarAplicacao(id) {
  if (!confirm('Cancelar esta prova? O link deixa de funcionar.')) return;
  try {
    await _provaChamar('aplicacao_cancelar', { id });
    _aplicacoesCarregadas = false;
    showToast('Prova cancelada.');
  } catch (e) {
    showToast(e.message);
  }
  render();
}
async function provaExcluirAplicacao(id) {
  if (!confirm('Excluir este registro e o resultado do candidato? Isso não pode ser desfeito.')) return;
  try {
    await _provaChamar('aplicacao_excluir', { id });
    registrarAuditoria('rs.prova_resultado_excluido', { aplicacaoId: id });
    _aplicacoesCarregadas = false;
    if (_provaDetalhe && _provaDetalhe.aplicacao.id === id) _provaDetalhe = null;
    showToast('Registro excluído.');
  } catch (e) {
    showToast(e.message);
  }
  render();
}

function provaFiltrar(campo, valor) {
  if (campo === 'status') _provaFiltroStatus = valor;
  else _provaFiltroProva = valor;
  render();
}
function provaAplicacoesFiltradas() {
  return (_aplicacoes || []).filter(
    (a) =>
      (!_provaFiltroStatus || a.status === _provaFiltroStatus) &&
      (!_provaFiltroProva || a.prova_id === _provaFiltroProva)
  );
}

/* ---------- Renderização ---------- */
function provaEditorHtml() {
  const r = _provaEditor;
  const e = escaparHtml;
  return `<div class="card">
    <h3>${r.id ? 'Editar prova' : 'Nova prova'}</h3>
    <div class="field"><label>Título <small>(o candidato vê)</small></label><input id="pv_titulo" type="text" maxlength="${PROVA_LIMITES.titulo}" value="${e(r.titulo)}"></div>
    <div class="field"><label>Instruções / descrição <small>(opcional — o candidato lê antes de começar)</small></label><textarea id="pv_desc" maxlength="${PROVA_LIMITES.descricao}">${e(r.descricao)}</textarea></div>
    <div class="grid2">
      <div class="field"><label>Tempo limite (minutos)</label><input id="pv_tempo" type="number" min="${PROVA_LIMITES.tempoMin}" max="${PROVA_LIMITES.tempoMax}" value="${e(r.tempo_limite_min)}"></div>
      <div class="field"><label>Nota mínima (%) <small>(só uma referência pra você)</small></label><input id="pv_nota" type="number" min="0" max="100" value="${e(r.nota_minima)}"></div>
    </div>
    <h4 style="margin:14px 0 8px;font-size:14px;">Questões (${r.questoes.length})</h4>
    ${r.questoes
      .map(
        (q, i) => `<div class="card" style="background:var(--surface-2);margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <b>Questão ${i + 1}</b>
          <span style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-ghost" onclick="provaEditorMoverQuestao(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
            <button class="btn btn-sm btn-ghost" onclick="provaEditorMoverQuestao(${i}, 1)" ${i === r.questoes.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
            <button class="btn btn-sm btn-ghost" onclick="provaEditorRemoverQuestao(${i})">Remover</button>
          </span>
        </div>
        <div class="field"><label>Enunciado</label><textarea id="pv_q${i}_enun" maxlength="${PROVA_LIMITES.enunciado}">${e(q.enunciado)}</textarea></div>
        <label style="font-size:13px;">Alternativas <small>— marque a correta</small></label>
        ${q.alternativas
          .map(
            (a, j) => `<div style="display:flex;gap:8px;align-items:center;margin:6px 0;">
            <input type="radio" name="pv_q${i}_ok" value="${e(a.id)}" ${q.correta === a.id ? 'checked' : ''} title="Esta é a correta">
            <input id="pv_q${i}_a${j}" type="text" maxlength="${PROVA_LIMITES.alternativa}" value="${e(a.texto)}" placeholder="Alternativa ${String.fromCharCode(65 + j)}" style="flex:1;">
            <button class="btn btn-sm btn-ghost" onclick="provaEditorRemoverAlternativa(${i}, ${j})" title="Remover alternativa">✕</button>
          </div>`
          )
          .join('')}
        <div style="display:flex;gap:14px;align-items:center;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-ghost" onclick="provaEditorAddAlternativa(${i})">+ Alternativa</button>
          <label style="font-size:13px;">Peso <input id="pv_q${i}_peso" type="number" min="1" max="${PROVA_LIMITES.pesoMax}" value="${e(q.peso)}" style="width:70px;"></label>
        </div>
      </div>`
      )
      .join('')}
    <button class="btn btn-sm btn-ghost" onclick="provaEditorAddQuestao()">+ Adicionar questão</button>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-primary" onclick="provaEditorSalvar()" ${_provaOcupada ? 'disabled' : ''}>Salvar prova</button>
      <button class="btn btn-ghost" onclick="provaCancelarEdicao()">Cancelar</button>
    </div>
  </div>`;
}

function provaListaHtml() {
  const e = escaparHtml;
  if (!_provasCarregadas) return '<div class="empty">Carregando…</div>';
  const modelos = `<div class="card"><h3>Começar com um modelo</h3><p class="small-muted" style="margin:0 0 10px;">Modelos prontos para você editar do seu jeito antes de usar.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">${PROVAS_MODELOS.map((m) => `<button class="btn btn-sm btn-ghost" onclick="provaUsarModelo('${m.chave}')" title="${e(m.descricao)}">${e(m.titulo)} (${m.questoes.length} questões)</button>`).join('')}</div></div>`;
  if (!_provas.length)
    return `${modelos}<div class="empty">Você ainda não criou nenhuma prova. Comece por um modelo acima ou clique em "Nova prova".</div>`;
  return (
    modelos +
    _provas
      .map(
        (p) => `<div class="card" style="margin-bottom:10px;${p.arquivada ? 'opacity:0.65;' : ''}">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-size:15px;font-weight:600;">${e(p.titulo)} ${p.arquivada ? '<span class="pill pill-neutral">arquivada</span>' : ''}</div>
          <div class="small-muted" style="margin-top:3px;">${p.questoes.length} questões · ${p.tempo_limite_min} min · nota mínima ${provaNotaTexto(p.nota_minima)} · aplicada ${p.aplicacoes}x (${p.concluidas} concluída(s))</div>
          ${p.descricao ? `<div class="small-muted" style="margin-top:3px;">${e(p.descricao)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;">
          <button class="btn btn-sm btn-ghost" onclick="provaEditarProva('${escaparParaOnclick(p.id)}')">Editar</button>
          <button class="btn btn-sm btn-ghost" onclick="provaDuplicarProva('${escaparParaOnclick(p.id)}')">Duplicar</button>
          <button class="btn btn-sm btn-ghost" onclick="provaArquivar('${escaparParaOnclick(p.id)}', ${p.arquivada ? 'false' : 'true'})">${p.arquivada ? 'Restaurar' : 'Arquivar'}</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--iniciar);" onclick="provaExcluir('${escaparParaOnclick(p.id)}')">Excluir</button>
        </div>
      </div>
    </div>`
      )
      .join('')
  );
}

function provaDetalheHtml() {
  const d = _provaDetalhe;
  const a = d.aplicacao;
  const e = escaparHtml;
  const textoDe = (q, id) => (q.alternativas.find((x) => x.id === id) || { texto: '—' }).texto;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
      <h3 style="margin:0;">${e(a.candidato_nome)} — ${e(a.prova_titulo)}</h3>
      <button class="btn btn-sm btn-ghost" onclick="provaFecharDetalhe()">Fechar</button>
    </div>
    <div class="small-muted" style="margin:6px 0 12px;">${e(provaResultadoTexto(a))}${a.duracao_s !== null ? ` · fez em ${provaDuracaoTexto(a.duracao_s)} de ${a.tempo_limite_min} min` : ''}${a.fora_do_prazo ? ' · <b>enviada fora do tempo</b>' : ''}</div>
    <div class="notice info" style="margin-bottom:12px;">A nota é um apoio à decisão e mede apenas conhecimento nesta prova. A decisão sobre o candidato é sua.</div>
    <table><thead><tr><th>#</th><th>Questão</th><th>Resposta do candidato</th><th>Resposta correta</th><th>Peso</th><th></th></tr></thead><tbody>
      ${d.questoes
        .map(
          (q, i) => `<tr>
        <td>${i + 1}</td><td>${e(q.enunciado)}</td>
        <td>${q.resposta ? e(textoDe(q, q.resposta)) : '<span class="small-muted">em branco</span>'}</td>
        <td>${e(textoDe(q, q.correta))}</td><td>${q.peso}</td>
        <td>${q.acertou === null ? '' : q.acertou ? '<span class="pill pill-alavancar">certa</span>' : '<span class="pill pill-neutral">errada</span>'}</td>
      </tr>`
        )
        .join('')}
    </tbody></table>
  </div>`;
}

function provaResultadosHtml() {
  const e = escaparHtml;
  if (!_aplicacoesCarregadas) {
    if (!_aplicacoesCarregando) carregarAplicacoesProvas();
    return '<div class="empty">Carregando…</div>';
  }
  const lista = provaAplicacoesFiltradas();
  const provasDasAplicacoes = [
    ...new Map((_aplicacoes || []).filter((a) => a.prova_id).map((a) => [a.prova_id, a.prova_titulo])).entries(),
  ];
  return `${_provaDetalhe ? provaDetalheHtml() : ''}
    <div class="card">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">
        <div class="field" style="margin:0;"><label>Prova</label><select onchange="provaFiltrar('prova', this.value)"><option value="">Todas</option>${provasDasAplicacoes.map(([id, titulo]) => `<option value="${e(id)}" ${_provaFiltroProva === id ? 'selected' : ''}>${e(titulo)}</option>`).join('')}</select></div>
        <div class="field" style="margin:0;"><label>Situação</label><select onchange="provaFiltrar('status', this.value)"><option value="">Todas</option>${Object.entries(
          PROVA_STATUS_ROTULO
        )
          .map(([v, r]) => `<option value="${v}" ${_provaFiltroStatus === v ? 'selected' : ''}>${e(r)}</option>`)
          .join('')}</select></div>
        <span class="small-muted" style="margin-left:auto;">${lista.length} registro(s)</span>
      </div>
      ${
        lista.length
          ? `<table><thead><tr><th>Candidato</th><th>Prova</th><th>Situação</th><th>Resultado</th><th>Quando</th><th></th></tr></thead><tbody>
        ${lista
          .map(
            (a) => `<tr>
          <td><b>${e(a.candidato_nome)}</b></td><td>${e(a.prova_titulo)}</td>
          <td><span class="pill ${a.status === 'concluida' ? 'pill-alavancar' : a.status === 'iniciada' ? 'pill-desenvolver' : 'pill-neutral'}">${e(provaStatusRotulo(a.status))}</span></td>
          <td>${a.status === 'concluida' ? `<b>${provaNotaTexto(a.nota)}</b> <span class="small-muted">${a.atingiu_minima ? 'atingiu a nota mínima' : 'abaixo da nota mínima'}</span>` : '—'}</td>
          <td class="small-muted">${new Date(a.concluida_em || a.criado_em).toLocaleDateString('pt-BR')}</td>
          <td style="white-space:nowrap;">
            ${a.status === 'concluida' ? `<button class="btn btn-sm btn-primary" onclick="provaVerDetalhe('${escaparParaOnclick(a.id)}')">Ver detalhes</button>` : ''}
            ${['enviada', 'iniciada', 'expirada'].includes(a.status) ? `<button class="btn btn-sm btn-ghost" onclick="provaReenviarLink('${escaparParaOnclick(a.id)}')">Reenviar link</button><button class="btn btn-sm btn-ghost" onclick="provaCancelarAplicacao('${escaparParaOnclick(a.id)}')">Cancelar</button>` : ''}
            <button class="btn btn-sm btn-ghost" style="color:var(--iniciar);" onclick="provaExcluirAplicacao('${escaparParaOnclick(a.id)}')">Excluir</button>
          </td></tr>`
          )
          .join('')}
      </tbody></table>`
          : '<div class="empty">Nenhuma prova aplicada ainda. Para aplicar, abra um candidato no funil do R&S e clique em "Aplicar prova".</div>'
      }
    </div>`;
}

function pageProvasRS() {
  if (!provasHabilitadasRS())
    return '<div class="empty">Só o Administrador e o RH acessam as provas do processo seletivo.</div>';
  if (!_provasCarregadas && !_provasCarregando) carregarProvas();
  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Provas</h1>
      <p class="page-desc">Monte provas de conhecimento com nota automática e aplique aos candidatos do seu processo seletivo.</p>
      <div class="notice info" style="margin-top:10px;">🧪 A nota é um <b>apoio à decisão</b> — a escolha do candidato é sempre sua. São provas de <b>conhecimento</b> (português, matemática, Excel, procedimentos...); testes psicológicos são privativos de psicólogos e exigem instrumentos próprios, e não devem ser montados aqui. O candidato faz a prova pelo link, sem login, em uma única tentativa, e o gabarito nunca é mostrado a ele. Resultados ficam guardados por até 24 meses.</div>
    </div>
    ${_provasErro ? `<div class="card" style="border-left:3px solid var(--iniciar);">${escaparHtml(_provasErro)} <button class="btn btn-sm btn-ghost" onclick="_provasCarregadas=false;render();">Tentar de novo</button></div>` : ''}
    ${
      _provaEditor
        ? provaEditorHtml()
        : `<div class="card" style="padding:10px 14px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-sm ${_provaAba === 'provas' ? 'btn-primary' : 'btn-ghost'}" onclick="_provaAba='provas';render();">Minhas provas</button>
          <button class="btn btn-sm ${_provaAba === 'resultados' ? 'btn-primary' : 'btn-ghost'}" onclick="_provaAba='resultados';render();">Resultados</button>
          <span style="margin-left:auto;"><button class="btn btn-sm btn-primary" onclick="provaNovaProva()">+ Nova prova</button></span>
        </div></div>
      ${_provaAba === 'resultados' ? provaResultadosHtml() : provaListaHtml()}`
    }
  `;
}
