/* =========================================================
   R&S — IMPORTAR PESSOAS DE UMA PLANILHA (CSV)
   -----------------------------------------------------------
   No Recrutamento, "Importar planilha" cadastra várias pessoas de uma vez. O arquivo é lido NO NAVEGADOR (nada
   vai para o servidor antes de você confirmar), o sistema mostra uma PRÉVIA (quem entra, quem é pulado e por quê) e só
   cria as pessoas quando você clica em "Importar".

   Regras:
   - Formato CSV (no Excel: Arquivo > Salvar como > CSV). Aceita separador ";" "," ou tabulação, aspas, quebras de
     linha dentro de aspas, e arquivo em UTF-8 ou no Windows-1252 (o "CSV" do Excel brasileiro).
   - Colunas reconhecidas (em qualquer ordem, com ou sem acento): nome (obrigatória), e-mail, telefone, origem, currículo.
   - Até 500 linhas e 1 MB por arquivo.
   - Duplicadas (no próprio arquivo ou já cadastradas, pelo e-mail ou telefone) e linhas com erro NÃO são importadas.
   - As pessoas entram "só cadastradas" (sem vaga e sem e-mail ao candidato) e NÃO entram no banco de talentos
     (que só recebe quem autorizou no formulário da vaga).
   - O texto de cada célula vira texto puro: nada é executado.

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const IMPORTACAO_LIMITES_RS = {
  linhas: 500,
  bytes: 1048576,
  nome: 120,
  email: 254,
  telefone: 30,
  origem: 80,
  curriculo: 5000,
};

// Como cada coluna pode vir escrita no cabeçalho (já sem acento, em minúsculas, só letras e números).
const IMPORTACAO_COLUNAS_RS = {
  nome: ['nome', 'nome completo', 'name', 'candidato', 'pessoa'],
  email: ['email', 'e mail', 'mail', 'correio eletronico'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'contato'],
  origem: ['origem', 'fonte', 'canal'],
  curriculo: ['curriculo', 'resumo', 'observacoes', 'observacao', 'obs', 'link'],
};

function normalizarCabecalhoRS(t) {
  return String(t == null ? '' : t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Bytes do arquivo -> texto. UTF-8 (com ou sem BOM); se não for UTF-8 válido, assume Windows-1252 (o CSV do Excel brasileiro).
function decodificarCsvRS(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch (e) {
    texto = new TextDecoder('windows-1252').decode(u8);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

// O separador mais usado na primeira linha, fora das aspas (; , ou tabulação). Empate/ausência: ";" (padrão do Excel brasileiro).
function detectarSeparadorRS(texto) {
  const contagem = { ';': 0, ',': 0, '\t': 0 };
  let dentro = false;
  for (const ch of String(texto)) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro && (ch === '\n' || ch === '\r')) break;
    else if (!dentro && ch in contagem) contagem[ch]++;
  }
  const [melhor, n] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? melhor : ';';
}

// CSV -> linhas de células. Aspas, "" dentro de aspas, quebra de linha dentro de aspas, CRLF/LF/CR; linhas totalmente vazias somem.
function lerCsvRS(texto, separador) {
  const sep = separador || detectarSeparadorRS(texto);
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentro = false;
  const t = String(texto);
  const fechaCampo = () => {
    linha.push(campo);
    campo = '';
  };
  const fechaLinha = () => {
    fechaCampo();
    if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (dentro) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else dentro = false;
      } else campo += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === sep) fechaCampo();
    else if (ch === '\n') fechaLinha();
    else if (ch === '\r') {
      if (t[i + 1] === '\n') i++;
      fechaLinha();
    } else campo += ch;
  }
  if (campo !== '' || linha.length) fechaLinha();
  return linhas;
}

// Descobre qual coluna é qual. Exige "nome". Devolve os índices e as colunas que foram ignoradas.
function mapearColunasRS(cabecalho) {
  const indices = {};
  const ignoradas = [];
  (cabecalho || []).forEach((c, i) => {
    const n = normalizarCabecalhoRS(c);
    const campo = Object.keys(IMPORTACAO_COLUNAS_RS).find((k) => IMPORTACAO_COLUNAS_RS[k].includes(n));
    if (campo && indices[campo] === undefined) indices[campo] = i;
    else if (String(c).trim()) ignoradas.push(String(c).trim());
  });
  if (indices.nome === undefined)
    return {
      indices,
      ignoradas,
      erro: 'Não achei a coluna "nome" na primeira linha. A primeira linha precisa ser o cabeçalho (nome, e-mail, telefone, origem, currículo).',
    };
  return { indices, ignoradas };
}

const EMAIL_VALIDO_IMPORTACAO_RS = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/;
function limparCelulaRS(v) {
  // tira caracteres de controle (menos tabulação e quebra de linha, que o trim e o espaço tratam)
  return Array.from(String(v == null ? '' : v))
    .filter((ch) => {
      const c = ch.codePointAt(0);
      return !(c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 127);
    })
    .join('')
    .trim();
}

// Valida UMA linha. Devolve { ok, pessoa, avisos } ou { ok:false, erro }.
function validarLinhaImportacaoRS(campos) {
  const L = IMPORTACAO_LIMITES_RS;
  const nome = limparCelulaRS(campos.nome).replace(/\s+/g, ' ');
  if (!nome) return { ok: false, erro: 'Sem nome.' };
  if (nome.length > L.nome) return { ok: false, erro: `Nome com mais de ${L.nome} caracteres.` };
  const email = limparCelulaRS(campos.email).toLowerCase();
  if (email && (email.length > L.email || !EMAIL_VALIDO_IMPORTACAO_RS.test(email)))
    return { ok: false, erro: 'E-mail inválido.' };
  const telefone = limparCelulaRS(campos.telefone);
  if (telefone.length > L.telefone) return { ok: false, erro: `Telefone com mais de ${L.telefone} caracteres.` };
  const origem = limparCelulaRS(campos.origem).slice(0, L.origem) || 'Importação de planilha';
  let curriculo = limparCelulaRS(campos.curriculo);
  const avisos = [];
  if (curriculo.length > L.curriculo) {
    curriculo = curriculo.slice(0, L.curriculo);
    avisos.push(`Currículo cortado em ${L.curriculo} caracteres.`);
  }
  if (!email && telefone.replace(/\D/g, '').length < 8)
    avisos.push('Sem e-mail nem telefone válido: não dá para saber se a pessoa já está cadastrada.');
  return { ok: true, pessoa: { nome, email, telefone, origem, curriculo }, avisos };
}

// Texto do CSV -> prévia completa. "chavesExistentes" = as chaves das pessoas já cadastradas (e-mail/telefone).
function prepararImportacaoRS(texto, chavesExistentes) {
  const L = IMPORTACAO_LIMITES_RS;
  const celulas = lerCsvRS(texto);
  if (!celulas.length) return { erro: 'O arquivo está vazio.' };
  const mapa = mapearColunasRS(celulas[0]);
  if (mapa.erro) return { erro: mapa.erro };
  const corpo = celulas.slice(1);
  if (!corpo.length) return { erro: 'O arquivo só tem o cabeçalho: não há pessoas para importar.' };
  if (corpo.length > L.linhas)
    return { erro: `O arquivo tem ${corpo.length} linhas e o máximo é ${L.linhas}. Divida a planilha em partes.` };
  const existentes = new Set(chavesExistentes || []);
  const vistas = new Map(); // chave -> número da linha em que apareceu primeiro
  const pegar = (linha, campo) => (mapa.indices[campo] === undefined ? '' : (linha[mapa.indices[campo]] ?? ''));
  const linhas = corpo.map((cel, i) => {
    const numero = i + 2; // número da linha na planilha (a 1 é o cabeçalho)
    const v = validarLinhaImportacaoRS({
      nome: pegar(cel, 'nome'),
      email: pegar(cel, 'email'),
      telefone: pegar(cel, 'telefone'),
      origem: pegar(cel, 'origem'),
      curriculo: pegar(cel, 'curriculo'),
    });
    if (!v.ok) return { linha: numero, status: 'erro', erro: v.erro, avisos: [] };
    const chave = chaveDaPessoaRS({ id: `linha-${numero}`, email: v.pessoa.email, telefone: v.pessoa.telefone });
    const temChave = !chave.startsWith('i:');
    if (temChave && existentes.has(chave))
      return { linha: numero, status: 'ja_cadastrada', pessoa: v.pessoa, avisos: v.avisos };
    if (temChave && vistas.has(chave))
      return {
        linha: numero,
        status: 'duplicada_arquivo',
        pessoa: v.pessoa,
        avisos: v.avisos,
        duplicadaDe: vistas.get(chave),
      };
    if (temChave) vistas.set(chave, numero);
    return { linha: numero, status: 'ok', pessoa: v.pessoa, avisos: v.avisos };
  });
  const conta = (s) => linhas.filter((l) => l.status === s).length;
  return {
    colunas: mapa.indices,
    ignoradas: mapa.ignoradas,
    linhas,
    resumo: {
      total: linhas.length,
      aptas: conta('ok'),
      duplicadasArquivo: conta('duplicada_arquivo'),
      jaCadastradas: conta('ja_cadastrada'),
      erros: conta('erro'),
    },
  };
}

// O arquivo-modelo que a pessoa baixa para preencher (com BOM e ";" para abrir certo no Excel brasileiro).
function modeloCsvImportacaoRS() {
  return '\ufeffnome;email;telefone;origem;curriculo\r\nMaria Silva;maria@exemplo.com.br;(11) 99999-0000;Indicação;Dez anos de experiência em vendas\r\nJoão Souza;joao@exemplo.com.br;(21) 98888-1111;LinkedIn;Formado em administração\r\n';
}

const ROTULOS_STATUS_IMPORTACAO_RS = {
  ok: { texto: 'Será importada', classe: 'pill-alavancar' },
  duplicada_arquivo: { texto: 'Repetida na planilha', classe: 'pill-neutral' },
  ja_cadastrada: { texto: 'Já cadastrada', classe: 'pill-neutral' },
  erro: { texto: 'Erro', classe: 'pill-iniciar' },
};

// ---------- estado e ações ----------
let _rsImportacao = { aberto: false, arquivo: '', preparo: null, erro: '' };

function abrirImportacaoRS() {
  _rsImportacao = { aberto: !_rsImportacao.aberto, arquivo: '', preparo: null, erro: '' };
  render();
}
function descartarImportacaoRS() {
  _rsImportacao = { aberto: true, arquivo: '', preparo: null, erro: '' };
  render();
}

function baixarModeloImportacaoRS() {
  const url = URL.createObjectURL(new Blob([modeloCsvImportacaoRS()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-pessoas.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lê o arquivo escolhido, confere tamanho e tipo, e monta a prévia. Nada é criado ainda.
async function lerArquivoImportacaoRS(ev) {
  const arq = ev && ev.target && ev.target.files && ev.target.files[0];
  if (ev && ev.target) ev.target.value = '';
  if (!arq) return;
  const falha = (erro) => {
    _rsImportacao = { aberto: true, arquivo: arq.name, preparo: null, erro };
    render();
  };
  if (/\.xlsx?$/i.test(arq.name))
    return falha(
      'Este é um arquivo do Excel. Abra-o no Excel e use Arquivo > Salvar como > CSV (separado por vírgulas ou por ponto e vírgula).'
    );
  if (!/\.(csv|txt)$/i.test(arq.name) && !/csv|text\/plain/i.test(arq.type || ''))
    return falha('Envie um arquivo CSV.');
  if (arq.size > IMPORTACAO_LIMITES_RS.bytes)
    return falha(`O arquivo tem mais de ${IMPORTACAO_LIMITES_RS.bytes / 1048576} MB. Divida a planilha em partes.`);
  if (arq.size === 0) return falha('O arquivo está vazio.');
  let texto;
  try {
    texto = decodificarCsvRS(await arq.arrayBuffer());
  } catch (e) {
    return falha('Não consegui ler o arquivo.');
  }
  const existentes = agruparPessoasRS(state.rs.candidatos).map((p) => p.chave);
  const preparo = prepararImportacaoRS(texto, existentes);
  _rsImportacao = { aberto: true, arquivo: arq.name, preparo: preparo.erro ? null : preparo, erro: preparo.erro || '' };
  render();
}

// Cria as pessoas "só cadastradas" das linhas aptas. Pula duplicadas e erros. Não manda e-mail a ninguém.
function confirmarImportacaoRS() {
  const preparo = _rsImportacao.preparo;
  if (!preparo) return;
  const aptas = preparo.linhas.filter((l) => l.status === 'ok');
  if (!aptas.length) return showToast('Nenhuma pessoa apta para importar.');
  const agora = new Date().toISOString();
  for (const l of aptas) {
    state.rs.candidatos.push({
      id: uid(),
      vagaId: null,
      nome: l.pessoa.nome,
      email: l.pessoa.email,
      telefone: l.pessoa.telefone,
      origem: l.pessoa.origem,
      curriculo: l.pessoa.curriculo,
      etapa: null,
      reprovado: false,
      historico: [
        { de: null, para: null, autorId: meuPerfilId, em: agora, observacao: 'Pessoa importada de planilha' },
      ],
      ...novoCarimbo(),
    });
  }
  if (typeof registrarAuditoria === 'function')
    registrarAuditoria('rs.pessoas_importadas', { quantidade: aptas.length });
  const puladas = preparo.resumo.total - aptas.length;
  _rsImportacao = { aberto: false, arquivo: '', preparo: null, erro: '' };
  showToast(
    `${aptas.length} pessoa(s) importada(s)${puladas ? `; ${puladas} linha(s) pulada(s) (repetidas, já cadastradas ou com erro)` : ''}.`
  );
  render();
}

// ---------- a tela ----------
function importacaoPainelHtml() {
  if (!_rsImportacao.aberto) return '';
  const e = escaparHtml;
  const p = _rsImportacao.preparo;
  const L = IMPORTACAO_LIMITES_RS;
  const aviso = _rsImportacao.erro
    ? `<div class="notice" style="margin:10px 0;border-color:var(--iniciar);">${e(_rsImportacao.erro)}</div>`
    : '';
  const previa = p
    ? `<div style="margin-top:12px;">
        <div style="font-size:13px;margin-bottom:6px;"><b>${e(_rsImportacao.arquivo)}</b>: ${p.resumo.total} linha(s) — <b>${p.resumo.aptas}</b> serão importadas${p.resumo.jaCadastradas ? `, ${p.resumo.jaCadastradas} já cadastrada(s)` : ''}${p.resumo.duplicadasArquivo ? `, ${p.resumo.duplicadasArquivo} repetida(s) na planilha` : ''}${p.resumo.erros ? `, <span style="color:var(--iniciar);">${p.resumo.erros} com erro</span>` : ''}.</div>
        ${p.ignoradas.length ? `<div class="small-muted" style="margin-bottom:6px;">Colunas ignoradas: ${p.ignoradas.map(e).join(', ')}.</div>` : ''}
        <div style="overflow-x:auto;"><table><thead><tr><th>Linha</th><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Situação</th></tr></thead><tbody>${p.linhas
          .slice(0, 20)
          .map((l) => {
            const r = ROTULOS_STATUS_IMPORTACAO_RS[l.status];
            const nota =
              l.status === 'erro'
                ? l.erro
                : l.status === 'duplicada_arquivo'
                  ? `igual à linha ${l.duplicadaDe}`
                  : (l.avisos || []).join(' ');
            return `<tr><td>${l.linha}</td><td>${e(l.pessoa ? l.pessoa.nome : '—')}</td><td>${e(l.pessoa ? l.pessoa.email || '—' : '—')}</td><td>${e(l.pessoa ? l.pessoa.telefone || '—' : '—')}</td><td><span class="pill ${r.classe}">${e(r.texto)}</span>${nota ? ` <span class="small-muted">${e(nota)}</span>` : ''}</td></tr>`;
          })
          .join('')}</tbody></table></div>
        ${p.linhas.length > 20 ? `<div class="small-muted" style="margin-top:4px;">Mostrando as 20 primeiras linhas de ${p.linhas.length}.</div>` : ''}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" ${p.resumo.aptas ? '' : 'disabled'} onclick="confirmarImportacaoRS()">Importar ${p.resumo.aptas} pessoa(s)</button>
          <button class="btn btn-ghost btn-sm" onclick="descartarImportacaoRS()">Escolher outro arquivo</button>
        </div>
      </div>`
    : '';
  return `<div class="card" style="background:var(--surface-2);margin-top:12px;">
    <b>Importar pessoas de uma planilha</b>
    <ol class="small-muted" style="margin:8px 0 8px 18px;padding:0;">
      <li>Baixe o <a href="#" onclick="baixarModeloImportacaoRS();return false;">modelo de planilha (CSV)</a> e preencha: <b>nome</b> (obrigatório), e-mail, telefone, origem e currículo.</li>
      <li>No Excel, salve como <b>CSV</b>. Aceita até ${L.linhas} linhas e ${L.bytes / 1048576} MB.</li>
      <li>Escolha o arquivo abaixo, confira a prévia e confirme.</li>
    </ol>
    <div class="small-muted" style="margin-bottom:8px;">Repetidas (mesmo e-mail ou telefone) e linhas com erro não são importadas. As pessoas entram <b>só cadastradas</b>, sem receber e-mail e sem ir para o banco de talentos. Importe apenas pessoas que você tem motivo legítimo para guardar (por exemplo, quem se candidatou).</div>
    ${p ? '' : `<input type="file" id="rs_import_arquivo" accept=".csv,.txt,text/csv,text/plain" onchange="lerArquivoImportacaoRS(event)">`}
    ${aviso}${previa}
  </div>`;
}
