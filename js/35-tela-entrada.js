/* =========================================================
   TELA DE ENTRADA (comercial, antes do login)
   -----------------------------------------------------------
   Mostra os planos com destaque nos preços e um formulário de
   solicitação de teste grátis de 7 dias. A solicitação grava em
   `solicitacoes_teste` (o Super Admin aprova depois) e dispara um
   e-mail de aviso. Quem já é cliente clica em "Entrar" e vai pro
   login normal (renderLogin).

   Estado _telaInicial: 'landing' (esta tela) | 'login' (o de sempre).

   Desde que a página planos.html (fora do app.html) passou a ser a
   landing comercial de verdade — mais completa, com todos os módulos
   e o painel de preços — esta tela interna ficou redundante como
   porta de entrada padrão: quem chega no app.html já veio de lá.
   Por isso o padrão agora é 'login' direto; a função irParaLanding()
   continua existindo caso um dia se queira voltar a mostrá-la.
   ========================================================= */

let _telaInicial = 'login';
let _solicTesteEnviada = false;
let _solicTesteEnviando = false;
let _solicTeste = { nome: '', email: '', empresa: '', telefone: '' };
// Mesma Site Key (pública) já usada em vaga.html — o domínio já está
// cadastrado no reCAPTCHA, não precisa de uma chave separada.
const RECAPTCHA_SITE_KEY_LANDING = '6LfeLM0tAAAAAEkhPUj62-mvS-IbcAzJbvYF3l0h';

// Contratação direta (Fase 1 — sem link de pagamento automático ainda,
// fica registrado pro Instituto INETRIS entrar em contato e fechar
// manualmente, igual já fazemos com a cobrança por WhatsApp).
let _solicContratacaoAberta = null; // nome do plano escolhido, ou null se fechado
let _solicContratacaoEnviada = false;
let _solicContratacaoEnviando = false;
let _solicContratacao = { nome: '', email: '', empresa: '', telefone: '', observacoes: '' };

function irParaLogin() {
  _telaInicial = 'login';
  renderTelaAuth();
}
function irParaLanding() {
  _telaInicial = 'landing';
  renderTelaAuth();
}

// Ponto de entrada da autenticação: decide entre landing e login.
function renderTelaAuth() {
  liberarRecursosDeTela(); // saiu (ou foi deslogado): nenhuma câmera pode ficar ligada
  // A landing comercial interna (renderLanding) foi removida como porta de
  // entrada — a página planos.html (fora do app.html) é agora a única
  // landing do sistema. Sempre vai direto pro login, não importa o valor
  // de _telaInicial (a função renderLanding() continua existindo no
  // arquivo, só não é mais chamada por aqui).
  renderLogin();
}

// Pra quando o Google carregar o script do reCAPTCHA depois deste ponto
// já ter rodado (mesma proteção de timing já usada em vaga.html).
function _renderRecaptchaLandingQuandoPronto() {
  if (
    typeof grecaptcha === 'undefined' ||
    !grecaptcha.render ||
    document.getElementById('recaptcha_teste_container')?.childElementCount
  ) {
    if (!document.getElementById('recaptcha_teste_container')) return; // tela mudou, desiste
    setTimeout(_renderRecaptchaLandingQuandoPronto, 200);
    return;
  }
  window._recaptchaTesteWidgetId = grecaptcha.render('recaptcha_teste_container', {
    sitekey: RECAPTCHA_SITE_KEY_LANDING,
  });
}

async function enviarSolicitacaoTeste() {
  const nome = document.getElementById('st-nome').value.trim();
  const email = document.getElementById('st-email').value.trim();
  const empresa = document.getElementById('st-empresa').value.trim();
  const telefone = document.getElementById('st-telefone').value.trim();
  const recaptchaToken =
    typeof grecaptcha !== 'undefined' && window._recaptchaTesteWidgetId !== undefined
      ? grecaptcha.getResponse(window._recaptchaTesteWidgetId)
      : '';

  if (!nome || !email || !empresa) {
    showToast('Preencha nome, e-mail e nome da empresa.');
    return;
  }
  if (!recaptchaToken) {
    showToast('Confirme que você não é um robô antes de enviar.');
    return;
  }
  _solicTeste = { nome, email, empresa, telefone };
  _solicTesteEnviando = true;
  renderLanding();

  // Automação total (decisão de produto): esta função já gera o código de
  // licença, aprova a solicitação e manda o e-mail com o código — tudo de
  // uma vez, sem precisar do Super Admin clicar em "Aprovar". A única
  // proteção contra abuso é o reCAPTCHA acima.
  const { data, error } = await sb.functions.invoke('teste-gratis', {
    body: { nome, email, empresa, telefone, recaptchaToken },
  });
  _solicTesteEnviando = false;

  if (error || data?.error) {
    console.error('Falha ao liberar teste grátis', error || data?.error);
    showToast((data && data.error) || 'Não foi possível liberar seu teste agora. Tente novamente.');
    if (typeof grecaptcha !== 'undefined' && window._recaptchaTesteWidgetId !== undefined)
      grecaptcha.reset(window._recaptchaTesteWidgetId);
    renderLanding();
    return;
  }

  _solicTesteEnviada = true;
  renderLanding();
}

function abrirSolicitacaoContratacao(nomePlano) {
  _solicContratacaoAberta = nomePlano;
  _solicContratacaoEnviada = false;
  renderLanding();
  setTimeout(() => document.getElementById('landing-contratacao')?.scrollIntoView({ behavior: 'smooth' }), 50);
}

async function enviarSolicitacaoContratacao() {
  const nome = document.getElementById('sc-nome').value.trim();
  const email = document.getElementById('sc-email').value.trim();
  const empresa = document.getElementById('sc-empresa').value.trim();
  const telefone = document.getElementById('sc-telefone').value.trim();
  const observacoes = document.getElementById('sc-observacoes').value.trim();
  if (!nome || !email || !empresa) {
    showToast('Preencha nome, e-mail e nome da empresa.');
    return;
  }
  _solicContratacao = { nome, email, empresa, telefone, observacoes };
  _solicContratacaoEnviando = true;
  renderLanding();

  const { error } = await sb.from('solicitacoes_contratacao').insert({
    nome_solicitante: nome,
    email,
    nome_empresa: empresa,
    telefone: telefone || null,
    plano_desejado: _solicContratacaoAberta,
    observacoes: observacoes || null,
  });
  _solicContratacaoEnviando = false;

  if (error) {
    console.error('Falha ao enviar solicitação de contratação', error);
    showToast('Não foi possível enviar sua solicitação. Tente novamente.');
    renderLanding();
    return;
  }

  sb.functions
    .invoke('enviar-email', {
      body: {
        destinatario: 'inetris25@gmail.com',
        assunto: `Nova solicitação de CONTRATAÇÃO (${_solicContratacaoAberta}) — ${empresa}`,
        corpoHtml: `<p><b>${escaparHtml(nome)}</b> (${escaparHtml(email)}) quer contratar o plano <b>${escaparHtml(_solicContratacaoAberta)}</b> para a empresa <b>${escaparHtml(empresa)}</b>.${telefone ? `<br>Telefone: ${escaparHtml(telefone)}` : ''}${observacoes ? `<br>Observações: ${escaparHtml(observacoes)}` : ''}</p><p>Veja no painel Super Admin → Solicitações de contratação, e entre em contato para fechar o pagamento.</p>`,
      },
    })
    .catch(() => {});

  _solicContratacaoEnviada = true;
  renderLanding();
}

function _cardPlanoLanding(p, destaque) {
  return `
    <div class="landing-plano ${destaque ? 'destaque' : ''}">
      ${destaque ? '<div class="landing-plano-tag">Mais escolhido</div>' : ''}
      <div class="landing-plano-nome">${p.nome}</div>
      <div class="landing-plano-faixa">${p.detalhe}</div>
      <div class="landing-plano-preco">${formatarPrecoPlano(p.precoNovo)}<span>/mês</span></div>
      <div class="landing-plano-implantacao">Implantação (única vez): <b>${formatarPrecoPlano(p.implantacao)}</b></div>
      <button class="btn ${destaque ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="abrirSolicitacaoContratacao('${p.nome}')">Quero contratar agora</button>
    </div>`;
}

function renderLanding() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="landing-wrap">
      <header class="landing-topo">
        <div class="landing-marca">
          <img src="data:image/png;base64,${LOGO_INETRIS_B64}" alt="INETRIS" class="landing-logo">
          <div>
            <div class="brand-name" style="font-size:18px;">INETRIS</div>
            <div class="brand-sub">Sistema de Gestão de Pessoas</div>
          </div>
        </div>
        <button class="btn btn-ghost" onclick="irParaLogin()">Já sou cliente · Entrar</button>
      </header>

      <section class="landing-hero">
        <h1>Gestão de pessoas com clareza, do organograma à avaliação.</h1>
        <p>Estrutura, cargos, avaliações por ciclo, PDI, controle de ponto e relatórios — tudo em um só lugar. Experimente 7 dias grátis.</p>
        <a href="#planos" class="btn btn-primary btn-lg" onclick="document.getElementById('landing-planos').scrollIntoView({behavior:'smooth'});return false;">Ver planos e testar grátis</a>
      </section>

      <section class="landing-planos" id="landing-planos">
        <h2>Escolha o plano do tamanho da sua equipe</h2>
        <p class="landing-planos-sub">A mensalidade é por faixa de colaboradores. A implantação é cobrada uma única vez, na contratação.</p>
        <div class="landing-planos-grid">
          ${_cardPlanoLanding(PLANOS_NORTE[0], false)}
          ${_cardPlanoLanding(PLANOS_NORTE[1], true)}
          ${_cardPlanoLanding(PLANOS_NORTE[2], false)}
        </div>
        <p class="landing-planos-nota">Todos os planos incluem 7 dias de teste grátis, sem compromisso.</p>
        <div class="landing-planos-personalizado">
          <span>Mais de 60 colaboradores?</span>
          <a href="#landing-contratacao" onclick="abrirSolicitacaoContratacao('Personalizado');return false;">Fale com a gente para uma proposta personalizada</a>
        </div>
      </section>

      <section class="landing-teste" id="landing-contratacao">
        ${
          !_solicContratacaoAberta
            ? ''
            : _solicContratacaoEnviada
              ? `
          <div class="landing-teste-ok">
            <div class="landing-teste-check">✓</div>
            <h3>Solicitação enviada!</h3>
            <p>Recebemos seu interesse no plano <b>${escaparHtml(_solicContratacaoAberta)}</b>. O Instituto INETRIS vai entrar em contato com <b>${escaparHtml(_solicContratacao.email)}</b> para combinar o pagamento e liberar seu acesso.</p>
            <button class="btn" onclick="_solicContratacaoAberta=null;renderLanding();">Voltar aos planos</button>
          </div>`
              : `
          <h3>Contratar o plano ${escaparHtml(_solicContratacaoAberta)}</h3>
          <p class="landing-teste-desc">Preencha os dados e o Instituto INETRIS vai entrar em contato para combinar o pagamento e liberar seu acesso.</p>
          <div class="landing-teste-form">
            <div class="field"><label>Seu nome</label><input id="sc-nome" type="text" value="${escaparHtml(_solicContratacao.nome)}"></div>
            <div class="field"><label>E-mail</label><input id="sc-email" type="email" value="${escaparHtml(_solicContratacao.email)}"></div>
            <div class="field"><label>Nome da empresa</label><input id="sc-empresa" type="text" value="${escaparHtml(_solicContratacao.empresa)}"></div>
            <div class="field"><label>Telefone / WhatsApp <small>(opcional)</small></label><input id="sc-telefone" type="tel" value="${escaparHtml(_solicContratacao.telefone)}"></div>
            <div class="field"><label>Observações <small>(opcional)</small></label><input id="sc-observacoes" type="text" value="${escaparHtml(_solicContratacao.observacoes)}"></div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="enviarSolicitacaoContratacao()" ${_solicContratacaoEnviando ? 'disabled' : ''}>${_solicContratacaoEnviando ? 'Enviando…' : 'Enviar solicitação'}</button>
            <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;" onclick="_solicContratacaoAberta=null;renderLanding();">Cancelar</button>
          </div>`
        }
      </section>

      <section class="landing-teste">
        ${
          _solicTesteEnviada
            ? `
          <div class="landing-teste-ok">
            <div class="landing-teste-check">✓</div>
            <h3>Teste liberado!</h3>
            <p>Enviamos o código de acesso para <b>${escaparHtml(_solicTeste.email)}</b> — confira sua caixa de entrada (e o spam, por garantia) para começar agora mesmo.</p>
            <button class="btn" onclick="_solicTesteEnviada=false;renderLanding();">Enviar outra solicitação</button>
          </div>`
            : `
          <h3>Comece seu teste grátis de 7 dias</h3>
          <p class="landing-teste-desc">Preencha os dados e o Instituto INETRIS enviará seu acesso.</p>
          <div class="landing-teste-form">
            <div class="field"><label>Seu nome</label><input id="st-nome" type="text" value="${escaparHtml(_solicTeste.nome)}"></div>
            <div class="field"><label>E-mail</label><input id="st-email" type="email" value="${escaparHtml(_solicTeste.email)}"></div>
            <div class="field"><label>Nome da empresa</label><input id="st-empresa" type="text" value="${escaparHtml(_solicTeste.empresa)}"></div>
            <div class="field"><label>Telefone / WhatsApp <small>(opcional)</small></label><input id="st-telefone" type="tel" value="${escaparHtml(_solicTeste.telefone)}"></div>
            <div id="recaptcha_teste_container" style="margin-bottom:12px;"></div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="enviarSolicitacaoTeste()" ${_solicTesteEnviando ? 'disabled' : ''}>${_solicTesteEnviando ? 'Enviando…' : 'Solicitar teste grátis'}</button>
          </div>`
        }
      </section>

      <footer class="landing-rodape">
        <span>Instituto INETRIS — Sistema de Gestão de Pessoas · <a href="termos.html" style="color:inherit;">Termos de Uso</a> · <a href="privacidade.html" style="color:inherit;">Política de Privacidade</a></span>
        <button class="btn btn-ghost btn-sm" onclick="irParaLogin()">Entrar no sistema</button>
      </footer>
    </div>
  `;
  if (!_solicTesteEnviada) _renderRecaptchaLandingQuandoPronto();
}
