/* =========================================================
   CENTRAL DE AJUDA / SUPORTE ESTRUTURADO
   -----------------------------------------------------------
   Três camadas, da mais barata pra mais cara:
   1) FAQ + sugestões automáticas enquanto a pessoa escreve o chamado
      (sem IA, sem custo — funções puras testadas);
   2) Assistente de IA (Edge Function "assistente-ajuda"): responde dúvida
      de uso com base numa base de conhecimento do sistema; se não souber,
      sugere abrir um chamado já preenchido com a conversa;
   3) Chamado pra equipe: qualquer usuário abre pra própria empresa; todo
      mundo da empresa vê os chamados dela (aberto → em andamento →
      resolvido). Ao abrir, a pessoa recebe na hora um e-mail de "recebemos
      seu chamado" com o protocolo. O Super Admin responde pelo painel.
   ========================================================= */

/* ---------- Interruptor do ASSISTENTE DE IA ----------
   DESLIGADO: a Central de Ajuda fica só com o FAQ e os chamados respondidos pela equipe — sem
   nenhum custo de API e sem que texto de cliente saia do sistema. O chat e a resposta automática
   nos chamados ficam escondidos (o código continua aqui, pronto pra religar).
   Para religar: (1) trocar false por true aqui; (2) nas Edge Functions assistente-ajuda e
   chamado-automatico, criar os secrets ANTHROPIC_API_KEY e ASSISTENTE_AJUDA_ATIVO=true.
   Passo a passo: docs/ASSISTENTE-IA.md */
const ASSISTENTE_IA_VISIVEL = false;

/* ---------- FAQ (a mesma verdade da base do assistente) ----------
   p = pergunta, r = resposta, k = palavras-chave (sem acento) pras sugestões. */
const FAQ_CENTRAL = [
  {
    p: 'Esqueci minha senha, como recuperar?',
    r: 'Na tela de login, clique em "Esqueci minha senha" e siga o link enviado por e-mail.',
    k: ['senha', 'esqueci', 'recuperar', 'redefinir', 'trocar'],
  },
  {
    p: 'Meu login foi bloqueado, o que fazer?',
    r: 'Depois de 5 tentativas de login erradas, o login fica bloqueado por 15 minutos. Aguarde e tente de novo, ou use "Esqueci minha senha".',
    k: ['bloqueado', 'bloqueio', 'tentativas', 'login', 'entrar', 'acessar', 'travado'],
  },
  {
    p: 'Como convido uma pessoa para o sistema?',
    r: 'Em Usuários & Acesso (Administrador e RH), em "Convidar nova pessoa", escolha o papel e clique em "Gerar convite". Passe o código à pessoa: ela cria a conta na aba "Cadastrar" da tela de login, marcando que tem um código de convite.',
    k: ['convidar', 'convite', 'convido', 'codigo', 'cadastrar', 'acesso', 'usuario', 'pessoa'],
  },
  {
    p: 'Como dar acesso a quem não tem e-mail?',
    r: 'Na tela Colaboradores, use "Criar acesso sem e-mail" no colaborador. O sistema cria um login e uma senha provisória, e a pessoa precisa trocar a senha no primeiro acesso.',
    k: ['email', 'sem', 'matricula', 'celular', 'provisoria', 'acesso', 'colaborador', 'login'],
  },
  {
    p: 'Como cadastro vários colaboradores de uma vez?',
    r: 'Na tela Colaboradores, use "Importar colaboradores em lote": envie uma planilha Excel ou CSV com as colunas Nome, Cargo, Unidade, Setor, Gestor e Admissão (opcional, AAAA-MM-DD). Há um botão para baixar o modelo.',
    k: ['importar', 'planilha', 'excel', 'csv', 'lote', 'varios', 'cadastrar', 'colaboradores', 'cadastro'],
  },
  {
    p: 'Atingi o limite de colaboradores do meu plano',
    r: 'O limite depende do plano: Essencial até 10, Gestão até 30 e Estratégico até 60. Para aumentar, veja a tela Pagamento ("Solicitar este plano") ou abra um chamado.',
    k: ['limite', 'plano', 'colaboradores', 'maximo', 'vagas', 'atingi', 'aumentar'],
  },
  {
    p: 'Como abro um ciclo de avaliação?',
    r: 'Em Ciclos de Avaliação, escolha o colaborador, defina o prazo final (quem está com a avaliação pendente recebe lembrete por e-mail em D-5, D-2 e D-0) e o modelo: Assíncrono (Colaborador → Líder → RH, pesos 25/50/25) ou Ao Vivo (sessão presencial, nota combinada pelos três).',
    k: ['ciclo', 'avaliacao', 'abrir', 'modelo', 'assincrono', 'vivo', 'prazo', 'avaliar'],
  },
  {
    p: 'O que significam Iniciar, Desenvolver e Alavancar?',
    r: 'São as três faixas em que cada indicador é classificado na avaliação: Iniciar (menor desempenho), Desenvolver (intermediário) e Alavancar (maior desempenho). Aparecem no Diagnóstico & PDI.',
    k: ['iniciar', 'desenvolver', 'alavancar', 'classificacao', 'diagnostico', 'pdi', 'nota'],
  },
  {
    p: 'Como funciona o banco de horas?',
    r: 'O saldo é calculado automaticamente a partir das batidas de ponto, comparando com a jornada do colaborador, com tolerância em minutos (atraso na entrada e hora extra na saída). Dias com justificativa aprovada são abonados. Veja o card de banco de horas na tela Ponto.',
    k: ['banco', 'horas', 'saldo', 'atraso', 'extra', 'tolerancia', 'jornada'],
  },
  {
    p: 'Não aparece o menu Ponto para mim',
    r: 'O módulo Ponto é ligado por empresa pelo Instituto INETRIS. Se o menu não aparece, o módulo não está ativo na sua empresa: abra um chamado pedindo a ativação.',
    k: ['ponto', 'menu', 'aparece', 'modulo', 'ativar', 'ativacao', 'habilitar'],
  },
  {
    p: 'Como bato o ponto?',
    r: 'No menu Ponto. Dependendo da configuração da empresa, o sistema pede para ler o QR do local e/ou tirar uma selfie. O Administrador exibe o QR em "Totem de ponto".',
    k: ['bater', 'ponto', 'qr', 'selfie', 'totem', 'registrar', 'entrada', 'saida'],
  },
  {
    p: 'Como justifico uma falta ou um atraso?',
    r: 'No menu Ponto, no card "Justificativas e abonos", você pode justificar falta, atraso/saída antecipada, ajuste de ponto ou atestado. A justificativa passa por aprovação; depois de aprovada, o dia é abonado.',
    k: ['justificar', 'justificativa', 'falta', 'atraso', 'atestado', 'abono', 'abonar', 'ajuste'],
  },
  {
    p: 'Onde vejo os candidatos que autorizaram o banco de talentos?',
    r: 'No menu R&S — Banco de talentos (Administrador e RH). Lá você busca por nome, cidade ou experiência, filtra por formação e disponibilidade, abre o currículo e pode remover alguém a qualquer momento. Cada pessoa fica por até 24 meses e depois sai sozinha.',
    k: ['banco', 'talentos', 'candidatos', 'autorizaram', 'curriculos', 'curriculo', 'futuras', 'vagas'],
  },
  {
    p: 'O que significa "Respondido (IA)" no meu chamado?',
    r: 'Nosso assistente de inteligência artificial respondeu o seu chamado. Se resolveu, clique em "Resolveu"; se não, clique em "Ainda preciso de ajuda" e a nossa equipe assume. Sem retorno em 3 dias, o chamado é encerrado sozinho — e você pode abrir outro quando quiser. Assuntos de cobrança, cancelamento e dados pessoais sempre vão direto para a equipe.',
    k: ['respondido', 'chamado', 'automatica', 'automatico', 'resposta', 'encerrado', 'assistente', 'status'],
    soComIA: true, // só aparece quando o assistente de IA está ligado
  },
  {
    p: 'Como aplico uma prova a um candidato?',
    r: 'No menu R&S — Provas (Administrador e RH), crie uma prova ou comece por um modelo pronto. Depois, no funil do R&S, abra o candidato e clique em "Aplicar prova": o link pode ir por e-mail ou você copia e envia. O candidato faz sem login, em uma única tentativa, e você acompanha o resultado na aba Resultados.',
    k: ['prova', 'provas', 'aplicar', 'candidato', 'processo', 'seletivo', 'teste', 'link', 'avaliacao'],
  },
  {
    p: 'O candidato vê a nota ou o gabarito da prova?',
    r: 'Não. Ele só vê a confirmação de que a prova foi enviada. A nota, as respostas e o gabarito ficam visíveis apenas para o Administrador e o RH, em R&S — Provas → Resultados.',
    k: ['candidato', 'nota', 'gabarito', 'prova', 'resultado', 'ver', 'enviada', 'respostas'],
  },
  {
    p: 'O que significa a nota mínima da prova?',
    r: 'É uma referência sua: a tela mostra se o candidato atingiu ou ficou abaixo dela. O sistema nunca reprova ninguém sozinho — a decisão é sempre do RH. As provas medem conhecimento; testes psicológicos são privativos de psicólogos e não devem ser montados ali. Os resultados ficam guardados por até 24 meses.',
    k: ['nota', 'minima', 'prova', 'atingiu', 'reprova', 'reprovar', 'decisao', 'psicologico', 'resultado'],
  },
  {
    p: 'Meu ponto é em papel, posso usar o sistema?',
    r: 'Sim. Em Folha de Ponto (papel) (Administrador e RH) você fotografa a folha ou a lista de presença do dia, o sistema lê os horários, você confere e corrige, e só então confirma. A leitura pode errar, por isso a conferência é obrigatória.',
    k: ['papel', 'folha', 'foto', 'fotografar', 'manual', 'lista', 'presenca', 'ponto'],
  },
  {
    p: 'Meu teste grátis acabou e o acesso foi bloqueado',
    r: 'Ao fim dos 7 dias o acesso é bloqueado, mas nada é apagado. Depois que o pagamento é confirmado, nossa equipe libera o acesso e tudo que você cadastrou continua lá. Abra um chamado para agilizar.',
    k: ['teste', 'gratis', 'expirou', 'acabou', 'bloqueado', 'acesso', 'pagamento', 'liberar', 'dias'],
  },
  {
    p: 'Como mudo de plano?',
    r: 'Na tela Pagamento (só Administrador), escolha o plano desejado e clique em "Solicitar este plano". Nossa equipe confirma a mudança com você.',
    k: ['plano', 'mudar', 'trocar', 'upgrade', 'pagamento', 'assinatura', 'mensalidade'],
  },
  {
    p: 'As respostas da NR1 são anônimas?',
    r: 'Sim. As respostas são anônimas e os resultados só aparecem agregados, quando o grupo tem um número mínimo de respondentes. O conteúdo deve ser validado por um profissional de Segurança e Saúde no Trabalho (SST).',
    k: ['nr1', 'anonima', 'anonimo', 'anonimato', 'riscos', 'psicossociais', 'pesquisa'],
  },
  {
    p: 'Como exporto um relatório?',
    r: 'Em Relatórios (Administrador e RH), escolha o tipo de relatório e use "Exportar PDF".',
    k: ['relatorio', 'relatorios', 'exportar', 'pdf', 'baixar', 'imprimir'],
  },
  {
    p: 'Quero ver, corrigir ou apagar meus dados (LGPD)',
    r: 'Use o botão "Solicitar meus dados (LGPD)" aqui na Central de Ajuda: ele abre um chamado já formatado com acesso, correção, exclusão ou portabilidade.',
    k: ['lgpd', 'dados', 'excluir', 'apagar', 'privacidade', 'exclusao', 'corrigir', 'portabilidade'],
  },
];

const FAQ_PALAVRAS_COMUNS = [
  'como',
  'para',
  'que',
  'uma',
  'com',
  'nao',
  'meu',
  'minha',
  'esta',
  'isso',
  'mais',
  'muito',
  'tem',
  'posso',
  'quero',
  'fazer',
  'sistema',
  'onde',
  'qual',
  'quais',
  'por',
  'dos',
  'das',
  'nos',
  'nas',
  'um',
  'uns',
  'ele',
  'ela',
  'esse',
  'essa',
  'aqui',
  'ola',
  'preciso',
  'ajuda',
];

function faqNormalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
}

// Sugere perguntas do FAQ parecidas com o que a pessoa está escrevendo.
// Palavra-chave igual vale 2 pontos; parecida (começa igual, 4+ letras) vale
// 1. Só sugere com pelo menos 2 pontos e, entre as candidatas, só as que
// chegam a pelo menos metade da pontuação da melhor — melhor não sugerir
// nada do que sugerir uma resposta que não tem a ver.
// O FAQ que o cliente vê: sem as perguntas que só fazem sentido com o assistente de IA ligado.
function faqExibido() {
  return FAQ_CENTRAL.filter((f) => ASSISTENTE_IA_VISIVEL || !f.soComIA);
}

function faqSugestoes(texto, faq = faqExibido(), maximo = 3) {
  const tokens = [
    ...new Set(
      faqNormalizar(texto)
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !FAQ_PALAVRAS_COMUNS.includes(t))
    ),
  ];
  if (!tokens.length) return [];
  const pontuadas = faq
    .map((item) => {
      let pontos = 0;
      item.k.forEach((kw) => {
        const k = faqNormalizar(kw).trim();
        if (tokens.includes(k)) pontos += 2;
        else if (tokens.some((t) => t.length >= 4 && k.length >= 4 && (t.startsWith(k) || k.startsWith(t))))
          pontos += 1;
      });
      return { item, pontos };
    })
    .filter((x) => x.pontos >= 2)
    .sort((a, b) => b.pontos - a.pontos);
  if (!pontuadas.length) return [];
  const corte = Math.max(2, pontuadas[0].pontos / 2);
  return pontuadas
    .filter((x) => x.pontos >= corte)
    .slice(0, maximo)
    .map((x) => x.item);
}

/* ---------- Chamados ---------- */

let _chamadosEmpresa = [];
let _chamadosCarregados = false;
let _novoChamadoAberto = false;

async function carregarChamadosEmpresa() {
  const { data, error } = await sb
    .from('chamados_suporte')
    .select(
      'id, assunto, mensagem, status, resposta, criado_em, atualizado_em, respondido_por_ia, feedback_cliente, fechado_automaticamente'
    )
    .eq('empresa_id', empresaIdAtual)
    .order('criado_em', { ascending: false });
  if (!error) _chamadosEmpresa = data || [];
  _chamadosCarregados = true;
  render();
}

function abrirNovoChamado() {
  _novoChamadoAberto = true;
  render();
}

// Abre o formulário já preenchido (LGPD, conversa com o assistente...).
function abrirChamadoComTexto(assunto, mensagem) {
  _novoChamadoAberto = true;
  render();
  setTimeout(() => {
    const campoAssunto = document.getElementById('cha_assunto');
    const campoMensagem = document.getElementById('cha_mensagem');
    if (campoAssunto) campoAssunto.value = assunto;
    if (campoMensagem) campoMensagem.value = mensagem;
    if (campoMensagem) campoMensagem.focus();
    campoAssunto?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

// Atalho pros direitos da LGPD (acesso, correção, exclusão, portabilidade).
function abrirSolicitacaoLGPD() {
  abrirChamadoComTexto(
    'Solicitação de direitos da LGPD',
    'Solicito, nos termos da LGPD (art. 18), o seguinte sobre meus dados pessoais no sistema:\n\n[ ] Acesso aos meus dados\n[ ] Correção de dados incorretos\n[ ] Exclusão dos meus dados\n[ ] Portabilidade dos meus dados\n\nDetalhe aqui o que precisa:\n'
  );
}

// Sugestões do FAQ enquanto a pessoa escreve o chamado — sem refazer a tela
// (senão o cursor sai do campo a cada letra).
function ajudaAtualizarSugestoes() {
  const caixa = document.getElementById('cha_sugestoes');
  if (!caixa) return;
  const texto = `${document.getElementById('cha_assunto')?.value || ''} ${document.getElementById('cha_mensagem')?.value || ''}`;
  const sugestoes = faqSugestoes(texto);
  caixa.innerHTML = sugestoes.length
    ? `<div style="padding:10px 12px;background:var(--gold-soft);border-radius:10px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Talvez isto já resolva:</div>
        ${sugestoes.map((s) => `<details style="margin-bottom:4px;"><summary style="cursor:pointer;font-size:13px;">${escaparHtml(s.p)}</summary><p class="small-muted" style="margin:4px 0 6px;">${escaparHtml(s.r)}</p></details>`).join('')}
      </div>`
    : '';
}

async function enviarChamadoSuporte() {
  const assunto = document.getElementById('cha_assunto').value.trim();
  const mensagem = document.getElementById('cha_mensagem').value.trim();
  if (!assunto || !mensagem) {
    showToast('Preencha o assunto e a mensagem.');
    return;
  }
  const meuPerfil = (_perfisEmpresa || []).find((p) => p.id === meuPerfilId);
  const nome = meuPerfil?.nome || 'Usuário';
  const emailPessoa = meuPerfil?.email || sessaoAtual?.user?.email || '';
  const { data: criado, error } = await sb
    .from('chamados_suporte')
    .insert({
      empresa_id: empresaIdAtual,
      criado_por: meuPerfilId,
      nome_solicitante: nome,
      email: emailPessoa,
      assunto,
      mensagem,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Falha ao abrir chamado', error);
    showToast('Não foi possível abrir o chamado. Verifique se a migration 34 foi aplicada.');
    return;
  }
  const protocolo = String(criado?.id || '')
    .slice(0, 8)
    .toUpperCase();

  // Aviso pra equipe do INETRIS.
  sb.functions
    .invoke('enviar-email', {
      body: {
        destinatario: 'inetris25@gmail.com',
        assunto: `Novo chamado de suporte #${protocolo} — ${state.empresa?.nomeFantasia || 'Empresa'}: ${assunto}`,
        corpoHtml: `<p><b>${escaparHtml(nome)}</b> (${escaparHtml(emailPessoa)}) abriu o chamado <b>#${protocolo}</b>:</p><p><b>${escaparHtml(assunto)}</b></p><p>${escaparHtml(mensagem)}</p>`,
      },
    })
    .catch(() => {});

  // Resposta automática pra quem abriu: confirma o recebimento e dá o protocolo.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPessoa)) {
    sb.functions
      .invoke('enviar-email', {
        body: {
          destinatario: emailPessoa,
          assunto: `Recebemos seu chamado #${protocolo}: ${assunto}`,
          corpoHtml: `<p>Olá, ${escaparHtml(nome)}!</p>
            <p>Recebemos o seu chamado <b>"${escaparHtml(assunto)}"</b> e nossa equipe vai responder em breve — por e-mail e também na Central de Ajuda do sistema.</p>
            <p>Protocolo: <b>#${protocolo}</b></p>
            ${ASSISTENTE_IA_VISIVEL ? '<p>Enquanto isso, o assistente da Central de Ajuda pode resolver dúvidas rápidas de uso do sistema.</p>' : '<p>Enquanto isso, veja as perguntas frequentes na Central de Ajuda — elas resolvem as dúvidas mais comuns de uso do sistema.</p>'}
            <p>Instituto INETRIS</p>`,
        },
      })
      .catch(() => {});
  }
  _novoChamadoAberto = false;
  showToast(
    ASSISTENTE_IA_VISIVEL
      ? `Chamado #${protocolo} aberto! Estamos analisando — a resposta chega aqui e por e-mail.`
      : `Chamado #${protocolo} aberto! Nossa equipe responde em breve — por e-mail e aqui na Central de Ajuda.`
  );
  await carregarChamadosEmpresa();
  // Assistente de IA desligado: o chamado segue direto pra equipe.
  if (!ASSISTENTE_IA_VISIVEL) return;
  // A IA tenta responder na hora; se não for assunto pra ela, a equipe é quem responde.
  const resultado = await processarChamadoAutomatico(criado?.id);
  if (resultado === 'ia') showToast('Respondemos o seu chamado automaticamente — veja abaixo e diga se resolveu.');
  else if (resultado === 'humano') showToast('Seu chamado foi encaminhado para a nossa equipe, que responde em breve.');
  await carregarChamadosEmpresa();
}

function _corStatusChamado(status) {
  if (status === 'resolvido') return 'pill-alavancar';
  if (status === 'em_andamento' || status === 'respondido_ia') return 'pill-desenvolver';
  return 'pill-neutral';
}
function _labelStatusChamado(status) {
  if (status === 'resolvido') return 'Resolvido';
  if (status === 'em_andamento') return 'Em andamento';
  if (status === 'respondido_ia') return 'Respondido (IA)';
  return 'Aberto';
}

// Bloco da resposta de um chamado: o que foi respondido, por quem (IA ou equipe), e — se foi a
// IA e o cliente ainda não disse nada — os dois botões que decidem o próximo passo.
function chamadoRespostaHtml(c) {
  if (!c.resposta) return '';
  const porIa = !!c.respondido_por_ia;
  const rotulo = porIa ? 'Resposta automática (IA)' : 'Resposta do suporte';
  const botoes =
    c.status === 'respondido_ia'
      ? `<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="small-muted">Isso resolveu?</span>
          <button class="btn btn-sm btn-primary" onclick="chamadoFeedback('${c.id}', true)">Resolveu</button>
          <button class="btn btn-sm btn-ghost" onclick="chamadoFeedback('${c.id}', false)">Ainda preciso de ajuda</button>
        </div>`
      : '';
  const nota =
    porIa && c.feedback_cliente === 'nao_resolveu' && c.status !== 'resolvido'
      ? '<div class="small-muted" style="margin-top:6px;">Você pediu atendimento humano — nossa equipe vai assumir este chamado.</div>'
      : porIa && c.fechado_automaticamente
        ? '<div class="small-muted" style="margin-top:6px;">Encerrado automaticamente por falta de retorno. Se ainda precisar, abra um novo chamado.</div>'
        : '';
  return `<div style="margin-top:6px;padding:8px 10px;background:var(--surface-2);border-radius:8px;font-size:13px;"><b>${rotulo}:</b> <span style="white-space:pre-wrap;">${escaparHtml(c.resposta)}</span>${botoes}${nota}</div>`;
}

// O cliente diz se a resposta automática resolveu. Passa pela função (o cliente não altera chamados direto).
async function chamadoFeedback(chamadoId, resolveu) {
  const { data, error } = await sb.functions.invoke('chamado-automatico', {
    body: { action: 'feedback', chamadoId, resolveu },
  });
  if (error || !data || data.error) {
    showToast(await mensagemDeErroFuncao(error, data, 'Não foi possível registrar agora. Tente de novo.'));
    return;
  }
  showToast(resolveu ? 'Que bom! Chamado encerrado.' : 'Certo — nossa equipe foi avisada e vai assumir o seu chamado.');
  await carregarChamadosEmpresa();
}

// Logo depois de abrir o chamado, a IA tenta responder (quando é dúvida de uso). Se não for o caso, ou se
// a função não estiver disponível, o chamado simplesmente segue pra equipe — nada se perde.
async function processarChamadoAutomatico(chamadoId) {
  try {
    const { data, error } = await sb.functions.invoke('chamado-automatico', {
      body: { action: 'processar', chamadoId },
    });
    if (error || !data || data.error) return null;
    return data.resultado;
  } catch (e) {
    return null;
  }
}

/* ---------- Assistente de IA ---------- */

let _assistenteMsgs = []; // [{ role: 'user'|'assistant', content, sugerirChamado? }] — só em memória, não é salvo
let _assistenteEnviando = false;
let _assistenteErro = '';
let _assistenteRascunho = '';

// Quando a função responde com erro (limite, falta de configuração...), o
// texto útil vem no corpo da resposta, não em error.message.
async function ajudaMensagemDeErro(error, data) {
  if (data && data.error) return data.error;
  try {
    if (error && error.context && typeof error.context.json === 'function') {
      const corpo = await error.context.json();
      if (corpo && corpo.error) return corpo.error;
    }
  } catch (e) {
    // sem corpo legível — segue com a mensagem padrão
  }
  return 'Não consegui responder agora. Tente de novo ou abra um chamado.';
}

function assistenteTecla(evento) {
  if (evento.key === 'Enter' && !evento.shiftKey) {
    evento.preventDefault();
    enviarPerguntaAssistente();
  }
}

function limparAssistente() {
  _assistenteMsgs = [];
  _assistenteErro = '';
  _assistenteRascunho = '';
  render();
}

async function enviarPerguntaAssistente() {
  if (_assistenteEnviando) return;
  const campo = document.getElementById('ass_input');
  const pergunta = String((campo ? campo.value : _assistenteRascunho) || '')
    .trim()
    .slice(0, 1200);
  if (!pergunta) return;

  _assistenteMsgs.push({ role: 'user', content: pergunta });
  _assistenteRascunho = '';
  _assistenteErro = '';
  _assistenteEnviando = true;
  render();
  assistenteRolarParaOFim(false);

  try {
    const historico = _assistenteMsgs.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const { data, error } = await sb.functions.invoke('assistente-ajuda', { body: { mensagens: historico } });
    if (error || !data || data.error) {
      _assistenteErro = await ajudaMensagemDeErro(error, data);
      return;
    }
    _assistenteMsgs.push({ role: 'assistant', content: data.resposta, sugerirChamado: !!data.sugerirChamado });
  } finally {
    _assistenteEnviando = false;
    render();
    assistenteRolarParaOFim(true);
  }
}

function assistenteRolarParaOFim(focar) {
  setTimeout(() => {
    const caixa = document.getElementById('ass_chat');
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
    const campo = document.getElementById('ass_input');
    if (focar && campo) campo.focus();
  }, 30);
}

// Leva a conversa pra um chamado: o assunto vem da 1ª pergunta e a mensagem
// já traz o que foi conversado, pra equipe não precisar perguntar tudo de novo.
function abrirChamadoDaConversa() {
  const primeira = (_assistenteMsgs.find((m) => m.role === 'user') || {}).content || '';
  const assunto = `Dúvida: ${primeira.replace(/\s+/g, ' ').slice(0, 80)}`;
  const transcricao = _assistenteMsgs
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Eu' : 'Assistente'}: ${m.content}`)
    .join('\n\n');
  abrirChamadoComTexto(
    assunto,
    `Conversei com o assistente da Central de Ajuda e preciso de ajuda da equipe.\n\n--- Conversa ---\n${transcricao.slice(-1800)}\n\n--- O que ainda preciso ---\n`
  );
}

function renderAssistente() {
  const mensagens = _assistenteMsgs
    .map((m) => {
      const eu = m.role === 'user';
      return `<div style="display:flex;justify-content:${eu ? 'flex-end' : 'flex-start'};margin-bottom:10px;">
        <div style="max-width:85%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;font-size:14px;${eu ? 'background:var(--gold);color:#fff;' : 'background:var(--surface-2);'}">${escaparHtml(m.content)}${
          !eu && m.sugerirChamado
            ? `<div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="abrirChamadoDaConversa()">Abrir chamado com esta conversa</button></div>`
            : ''
        }</div>
      </div>`;
    })
    .join('');
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Assistente de ajuda <small>pergunte como fazer algo no sistema</small></h3>
        ${_assistenteMsgs.length ? `<button class="btn btn-ghost btn-sm" onclick="limparAssistente()">Nova conversa</button>` : ''}
      </div>
      <div id="ass_chat" style="margin-top:12px;max-height:360px;overflow-y:auto;${_assistenteMsgs.length || _assistenteEnviando ? 'padding:4px 2px;' : ''}">
        ${_assistenteMsgs.length ? mensagens : '<p class="small-muted" style="margin:0;">Ex.: "como convido um colaborador?", "como funciona o banco de horas?", "como abro um ciclo de avaliação?"</p>'}
        ${_assistenteEnviando ? '<div class="small-muted" style="margin:4px 0 8px;">Digitando…</div>' : ''}
      </div>
      ${_assistenteErro ? `<div style="color:var(--iniciar);font-size:13px;margin-top:8px;">${escaparHtml(_assistenteErro)} <a href="#" onclick="abrirNovoChamado();return false;">Abrir chamado</a></div>` : ''}
      <div style="display:flex;gap:8px;align-items:flex-end;margin-top:12px;">
        <textarea id="ass_input" rows="2" maxlength="1200" style="flex:1;" placeholder="Escreva sua dúvida e tecle Enter" ${_assistenteEnviando ? 'disabled' : ''} oninput="_assistenteRascunho=this.value" onkeydown="assistenteTecla(event)">${escaparHtml(_assistenteRascunho)}</textarea>
        <button class="btn btn-primary" onclick="enviarPerguntaAssistente()" ${_assistenteEnviando ? 'disabled' : ''}>Enviar</button>
      </div>
      <p class="small-muted" style="margin:10px 0 0;font-size:12px;">Este assistente é uma inteligência artificial e pode errar — em caso de dúvida, abra um chamado. Ele não vê os dados da sua empresa. Não envie senhas, CPF ou dados de saúde. As perguntas são enviadas à Anthropic apenas para gerar a resposta e a conversa não fica salva no sistema.</p>
    </div>`;
}

/* ---------- Tela ---------- */

function pageCentralAjuda() {
  if (!_chamadosCarregados) carregarChamadosEmpresa();

  return `
    <div class="page-head">
      <div class="eyebrow">Suporte</div>
      <h1>Central de Ajuda</h1>
      <p class="page-desc">${ASSISTENTE_IA_VISIVEL ? 'Tire dúvidas com o assistente, veja as perguntas frequentes ou abra um chamado diretamente com o Instituto INETRIS.' : 'Veja as perguntas frequentes ou abra um chamado diretamente com o Instituto INETRIS.'}</p>
      <p class="small-muted">Documentos: <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> · <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a></p>
    </div>

    ${ASSISTENTE_IA_VISIVEL ? renderAssistente() : ''}

    <div class="card">
      <h3>Perguntas frequentes</h3>
      ${faqExibido()
        .map(
          (f) =>
            `<details style="margin-bottom:8px;"><summary style="cursor:pointer;font-weight:600;padding:8px 0;">${escaparHtml(f.p)}</summary><p class="small-muted" style="padding:4px 0 8px;">${escaparHtml(f.r)}</p></details>`
        )
        .join('')}
      <details><summary style="cursor:pointer;font-weight:600;padding:8px 0;">Não encontrei minha dúvida aqui, e agora?</summary><p class="small-muted" style="padding:4px 0 8px;">${ASSISTENTE_IA_VISIVEL ? 'Pergunte ao assistente acima ou abra um chamado abaixo' : 'Abra um chamado abaixo'} — nossa equipe responde diretamente por aqui e por e-mail.</p></details>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Meus chamados</h3>
        <button class="btn btn-ghost btn-sm" onclick="abrirSolicitacaoLGPD()">Solicitar meus dados (LGPD)</button>
        <button class="btn btn-primary btn-sm" onclick="abrirNovoChamado()">Abrir novo chamado</button>
      </div>
      ${
        _novoChamadoAberto
          ? `
        <div class="card" style="background:var(--surface-2);margin-top:12px;">
          <div class="field"><label>Assunto</label><input id="cha_assunto" type="text" placeholder="Resuma o problema em poucas palavras" oninput="ajudaAtualizarSugestoes()"></div>
          <div id="cha_sugestoes"></div>
          <div class="field"><label>Mensagem</label><textarea id="cha_mensagem" rows="4" placeholder="Descreva o que está acontecendo, com o máximo de detalhe possível" oninput="ajudaAtualizarSugestoes()"></textarea></div>
          <button class="btn btn-primary btn-sm" onclick="enviarChamadoSuporte()">Enviar chamado</button>
          <button class="btn btn-ghost btn-sm" onclick="_novoChamadoAberto=false;render();">Cancelar</button>
        </div>`
          : ''
      }
      ${
        _chamadosEmpresa.length
          ? `<table style="margin-top:14px;"><thead><tr><th>Assunto</th><th>Status</th><th>Aberto em</th></tr></thead><tbody>
            ${_chamadosEmpresa
              .map(
                (c) => `<tr>
              <td><b>${escaparHtml(c.assunto)}</b><div class="small-muted" style="margin-top:2px;">${escaparHtml(c.mensagem)}</div>${chamadoRespostaHtml(c)}</td>
              <td><span class="pill ${_corStatusChamado(c.status)}">${_labelStatusChamado(c.status)}</span></td>
              <td class="small-muted">${new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
            </tr>`
              )
              .join('')}
          </tbody></table>`
          : '<div class="empty" style="margin-top:10px;">Nenhum chamado aberto ainda.</div>'
      }
    </div>
  `;
}
