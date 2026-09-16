/* =========================================================
   TELA DE ENTRADA (comercial, antes do login)
   -----------------------------------------------------------
   Mostra os planos com destaque nos preços e um formulário de
   solicitação de teste grátis de 7 dias. A solicitação grava em
   `solicitacoes_teste` (o Super Admin aprova depois) e dispara um
   e-mail de aviso. Quem já é cliente clica em "Entrar" e vai pro
   login normal (renderLogin).

   Estado _telaInicial: 'landing' (esta tela) | 'login' (o de sempre).
   ========================================================= */

let _telaInicial = 'landing';
let _solicTesteEnviada = false;
let _solicTesteEnviando = false;
let _solicTeste = { nome: '', email: '', empresa: '', telefone: '' };

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
  if (_telaInicial === 'login') {
    renderLogin();
  } else {
    renderLanding();
  }
}

async function enviarSolicitacaoTeste() {
  const nome = document.getElementById('st-nome').value.trim();
  const email = document.getElementById('st-email').value.trim();
  const empresa = document.getElementById('st-empresa').value.trim();
  const telefone = document.getElementById('st-telefone').value.trim();
  if (!nome || !email || !empresa) {
    showToast('Preencha nome, e-mail e nome da empresa.');
    return;
  }
  _solicTeste = { nome, email, empresa, telefone };
  _solicTesteEnviando = true;
  renderLanding();

  const { error } = await sb.from('solicitacoes_teste').insert({
    nome_solicitante: nome,
    email,
    nome_empresa: empresa,
    telefone: telefone || null,
  });
  _solicTesteEnviando = false;

  if (error) {
    console.error('Falha ao enviar solicitação', error);
    showToast('Não foi possível enviar sua solicitação. Tente novamente.');
    renderLanding();
    return;
  }

  // Aviso por e-mail pro INETRIS (não bloqueia; se o e-mail falhar, a
  // solicitação já foi gravada e aparece no painel do Super Admin).
  sb.functions
    .invoke('enviar-email', {
      body: {
        para: 'inetris25@gmail.com',
        assunto: `Nova solicitação de teste grátis — ${empresa}`,
        html: `<p><b>${nome}</b> (${email}) solicitou um teste grátis para a empresa <b>${empresa}</b>.${telefone ? `<br>Telefone: ${telefone}` : ''}</p><p>Aprove no painel Super Admin → Solicitações de teste.</p>`,
      },
    })
    .catch(() => {});

  _solicTesteEnviada = true;
  renderLanding();
}

function _cardPlanoLanding(p, destaque) {
  return `
    <div class="landing-plano ${destaque ? 'destaque' : ''}">
      ${destaque ? '<div class="landing-plano-tag">Mais escolhido</div>' : ''}
      <div class="landing-plano-nome">${p.nome}</div>
      <div class="landing-plano-preco">${formatarPrecoPlano(p.precoNovo)}<span>/mês</span></div>
      <div class="landing-plano-detalhe">${p.detalhe}</div>
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
        <h2>Escolha o plano ideal para o tamanho da sua equipe</h2>
        <div class="landing-planos-grid">
          ${_cardPlanoLanding(PLANOS_NORTE[0], false)}
          ${_cardPlanoLanding(PLANOS_NORTE[1], true)}
          ${_cardPlanoLanding(PLANOS_NORTE[2], false)}
        </div>
        <p class="landing-planos-nota">Valores mensais. Todos os planos incluem 7 dias de teste grátis, sem compromisso.</p>
      </section>

      <section class="landing-teste">
        ${
          _solicTesteEnviada
            ? `
          <div class="landing-teste-ok">
            <div class="landing-teste-check">✓</div>
            <h3>Solicitação enviada!</h3>
            <p>Recebemos seu pedido de teste grátis. O Instituto INETRIS vai analisar e enviar o acesso para <b>${escaparHtml(_solicTeste.email)}</b> em breve.</p>
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
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="enviarSolicitacaoTeste()" ${_solicTesteEnviando ? 'disabled' : ''}>${_solicTesteEnviando ? 'Enviando…' : 'Solicitar teste grátis'}</button>
          </div>`
        }
      </section>

      <footer class="landing-rodape">
        <span>Instituto INETRIS — Sistema de Gestão de Pessoas</span>
        <button class="btn btn-ghost btn-sm" onclick="irParaLogin()">Entrar no sistema</button>
      </footer>
    </div>
  `;
}
