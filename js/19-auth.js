const PAPEL_PARA_ROLE = { owner: 'admin', rh: 'rh', lider: 'gestor', colaborador: 'colaborador' };
let modoLogin = 'entrar'; // entrar | cadastrar
let temConviteLogin = false;
let aceiteTermosLogin = false;
let erroLogin = null;
let carregandoLogin = false;
// BUG CORRIGIDO: o formulário de login não preservava o que a pessoa já
// tinha digitado quando a tela re-renderizava (ex.: depois de um erro de
// senha, ou ao ficar bloqueada) — os campos de e-mail e senha voltavam
// vazios, obrigando a redigitar tudo de novo a cada tentativa.
let valorEmailLogin = '';
let valorSenhaLogin = '';
let valorNomeLogin = '';
let valorEmpresaLogin = '';
let valorCodigoLogin = '';
let valorCodigoLicencaLogin = ''; // Código de licença — obrigatório pra criar uma Empresa nova (controle do dono do NORTE)

/* ---------- Bloqueio de login após 5 tentativas falhas (Fluxo de Navegação, Cap. 1.2) ----------
   Duas camadas: localStorage (resposta instantânea, só nesse navegador) +
   a Edge Function "login-bloqueio" (fonte de verdade de verdade, no banco,
   por e-mail — sobrevive a limpar o navegador e vale em qualquer
   dispositivo). Mesmo assim, quem chamar a API de autenticação do Supabase
   bem por fora da nossa tela de login não passa por nenhuma das duas — pra
   fechar essa brecha específica, precisaria de um Auth Hook configurado
   direto no painel do Supabase. */
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_BLOQUEIO_MINUTOS = 15;
function chaveTentativasLogin(email) {
  return `norte_login_tentativas_${email.toLowerCase().trim()}`;
}
function lerTentativasLogin(email) {
  try {
    const raw = localStorage.getItem(chaveTentativasLogin(email));
    return raw ? JSON.parse(raw) : { count: 0, bloqueadoAte: null };
  } catch (e) {
    return { count: 0, bloqueadoAte: null };
  }
}
function salvarTentativasLogin(email, dados) {
  try {
    localStorage.setItem(chaveTentativasLogin(email), JSON.stringify(dados));
  } catch (e) {}
}
function statusBloqueioLogin(email) {
  const dados = lerTentativasLogin(email);
  if (dados.bloqueadoAte && new Date(dados.bloqueadoAte) > new Date()) {
    const minutosRestantes = Math.ceil((new Date(dados.bloqueadoAte) - new Date()) / 60000);
    return { bloqueado: true, minutosRestantes };
  }
  return { bloqueado: false };
}
function registrarTentativaFalha(email) {
  const dados = lerTentativasLogin(email);
  dados.count = (dados.count || 0) + 1;
  if (dados.count >= LOGIN_MAX_TENTATIVAS) {
    const ate = new Date();
    ate.setMinutes(ate.getMinutes() + LOGIN_BLOQUEIO_MINUTOS);
    dados.bloqueadoAte = ate.toISOString();
    dados.count = 0;
  }
  salvarTentativasLogin(email, dados);
  return dados;
}
function limparTentativasLogin(email) {
  salvarTentativasLogin(email, { count: 0, bloqueadoAte: null });
}

// Tela de troca de senha obrigatória — mostrada quando a conta foi criada
// com senha provisória (acesso sem e-mail, gerado pelo RH). A pessoa só
// segue pro sistema depois de definir a própria senha.
function renderTrocaSenhaObrigatoria() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:36px 32px;">
        <div class="brand-name" style="font-size:20px;margin-bottom:4px;">Defina sua senha</div>
        <p class="page-desc" style="margin-bottom:20px;">Esta conta foi criada com uma senha provisória. Escolha uma senha própria para continuar.</p>
        <div class="field"><label>Nova senha <small>(mínimo 6 caracteres)</small></label><input id="tf_nova_senha" type="password"></div>
        <div class="field"><label>Confirme a nova senha</label><input id="tf_confirma_senha" type="password"></div>
        ${erroLogin ? `<p style="color:var(--iniciar);font-size:13px;margin:8px 0;">${escaparHtml(erroLogin)}</p>` : ''}
        <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="trocarSenhaObrigatoria()">Definir senha e entrar</button>
      </div>
    </div>`;
}

async function trocarSenhaObrigatoria() {
  const nova = document.getElementById('tf_nova_senha').value;
  const confirma = document.getElementById('tf_confirma_senha').value;
  if (!nova || nova.length < 6) {
    erroLogin = 'A senha precisa ter pelo menos 6 caracteres.';
    renderTrocaSenhaObrigatoria();
    return;
  }
  if (nova !== confirma) {
    erroLogin = 'As senhas não coincidem.';
    renderTrocaSenhaObrigatoria();
    return;
  }
  const { error: erroSenha } = await sb.auth.updateUser({ password: nova });
  if (erroSenha) {
    erroLogin = 'Não foi possível trocar a senha: ' + erroSenha.message;
    renderTrocaSenhaObrigatoria();
    return;
  }
  await sb.from('perfis').update({ senha_provisoria: false }).eq('id', meuPerfilId);
  erroLogin = null;
  location.reload(); // reinicia o login normal, agora sem a senha provisória
}

function renderLogin() {
  const statusAtual = valorEmailLogin ? statusBloqueioLogin(valorEmailLogin) : { bloqueado: false };
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;width:100%;">
      <div style="width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:36px 32px;">
        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:22px;">
          ${compassSVGEstatico()}
          <div class="brand-name" style="margin-top:10px;font-size:22px;">INETRIS</div>
          <div class="brand-sub" style="text-align:center;">Sistema de Gestão de Pessoas</div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:18px;">
          <button class="btn ${modoLogin === 'entrar' ? 'btn-primary' : ''}" style="flex:1;justify-content:center;" onclick="mudarModoLogin('entrar')">Entrar</button>
          <button class="btn ${modoLogin === 'cadastrar' ? 'btn-primary' : ''}" style="flex:1;justify-content:center;" onclick="mudarModoLogin('cadastrar')">Cadastrar</button>
        </div>

        <form id="form-login" onsubmit="return false;">
          ${
            modoLogin === 'cadastrar'
              ? `
            <div class="field"><label>Seu nome</label><input id="li-nome" type="text" required value="${valorNomeLogin}" oninput="valorNomeLogin=this.value;"></div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-dim);margin-bottom:12px;">
              <input type="checkbox" id="li-tem-convite" ${temConviteLogin ? 'checked' : ''} onchange="temConviteLogin=this.checked;renderLogin();">
              Tenho um código de convite de uma empresa
            </label>
            ${
              temConviteLogin
                ? `<div class="field"><label>Código de convite</label><input id="li-codigo" type="text" required value="${valorCodigoLogin}" oninput="valorCodigoLogin=this.value;"></div>`
                : `<div class="field"><label>Nome da empresa</label><input id="li-empresa" type="text" required value="${valorEmpresaLogin}" oninput="valorEmpresaLogin=this.value;"></div>
                 <div class="field"><label>Código de licença <small>(fornecido pelo Instituto INETRIS)</small></label><input id="li-codigo-licenca" type="text" required value="${valorCodigoLicencaLogin}" oninput="valorCodigoLicencaLogin=this.value;"></div>`
            }
          `
              : ''
          }
          <div class="field"><label>E-mail</label><input id="li-email" type="email" required value="${valorEmailLogin}" oninput="valorEmailLogin=this.value;"></div>
          <div class="field"><label>Senha</label><input id="li-senha" type="password" minlength="6" required value="${valorSenhaLogin}" oninput="valorSenhaLogin=this.value;"></div>
          ${modoLogin === 'entrar' ? `<p style="text-align:right;margin:-6px 0 12px;"><a href="#" style="font-size:12.5px;color:var(--ink-dim);" onclick="esqueciSenhaLogin();return false;">Esqueci minha senha</a></p>` : ''}
          ${
            modoLogin === 'cadastrar'
              ? `<label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--ink-dim);margin:4px 0 14px;">
              <input type="checkbox" id="li-aceite-termos" ${aceiteTermosLogin ? 'checked' : ''} onchange="aceiteTermosLogin=this.checked;" style="margin-top:2px;">
              <span>Li e aceito os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span>
            </label>`
              : ''
          }
          ${erroLogin ? `<p style="color:var(--iniciar);font-size:12.5px;margin:-4px 0 12px;">${erroLogin}</p>` : ''}
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="${modoLogin === 'entrar' ? 'entrarLogin()' : 'cadastrarLogin()'}" ${carregandoLogin || statusAtual.bloqueado ? 'disabled' : ''}>
            ${carregandoLogin ? 'Aguarde…' : statusAtual.bloqueado ? `Bloqueado (${statusAtual.minutosRestantes} min)` : modoLogin === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  `;
}
function compassSVGEstatico() {
  return `<div class="compass-wrap" style="width:72px;height:72px;">
    <img src="data:image/png;base64,${LOGO_INETRIS_B64}" alt="Instituto INETRIS" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;
}
function mudarModoLogin(m) {
  modoLogin = m;
  erroLogin = null;
  renderLogin();
}

async function esqueciSenhaLogin() {
  const email = valorEmailLogin.trim();
  if (!email) {
    erroLogin = 'Preencha o e-mail para receber o link de redefinição de senha.';
    renderLogin();
    return;
  }
  carregandoLogin = true;
  erroLogin = null;
  renderLogin();
  // BUG CORRIGIDO: sem `redirectTo`, o Supabase usa a "Site URL" configurada
  // no painel do projeto como destino do link do e-mail — se esse endereço
  // estiver desatualizado ou for diferente de onde o site está hospedado de
  // fato (ex.: GitHub Pages), o link do e-mail leva a um endereço que não
  // existe ("não é possível acessar o site"). Forçando explicitamente o
  // endereço atual da página, o link sempre aponta pro lugar certo.
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  carregandoLogin = false;
  erroLogin = error
    ? 'Não foi possível enviar o link agora. Tente novamente.'
    : 'Se este e-mail estiver cadastrado, enviamos um link de redefinição de senha.';
  renderLogin();
}

// Checagem real de bloqueio: no SERVIDOR (banco de dados), não só no
// localStorage — sobrevive a limpar o navegador e vale em qualquer
// dispositivo. Se a função não responder por algum motivo (rede, ainda
// não implantada), deixa passar — um problema de infraestrutura não deve
// travar o login de todo mundo; o localStorage continua como uma camada
// extra, mais rápida, de qualquer forma.
async function chamarLoginBloqueio(action, email) {
  try {
    const { data, error } = await sb.functions.invoke('login-bloqueio', { body: { action, email } });
    if (error) return null;
    return data;
  } catch (e) {
    console.warn('login-bloqueio indisponível, seguindo só com a checagem local', e);
    return null;
  }
}

async function entrarLogin() {
  const email = valorEmailLogin.trim();
  const senha = valorSenhaLogin;
  if (!email || !senha) {
    erroLogin = 'Preencha e-mail e senha.';
    renderLogin();
    return;
  }

  const statusLocal = statusBloqueioLogin(email);
  if (statusLocal.bloqueado) {
    erroLogin = `Muitas tentativas de login incorretas. Tente novamente em ${statusLocal.minutosRestantes} minuto(s).`;
    renderLogin();
    return;
  }
  const statusServidor = await chamarLoginBloqueio('checar', email);
  if (statusServidor?.bloqueado) {
    erroLogin = `Muitas tentativas de login incorretas. Tente novamente em ${statusServidor.minutosRestantes} minuto(s).`;
    renderLogin();
    return;
  }

  carregandoLogin = true;
  erroLogin = null;
  renderLogin();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  carregandoLogin = false;
  if (error) {
    const dados = registrarTentativaFalha(email);
    await chamarLoginBloqueio('registrar_falha', email);
    const restantes = LOGIN_MAX_TENTATIVAS - dados.count;
    erroLogin = dados.bloqueadoAte
      ? `Muitas tentativas incorretas. Login bloqueado por ${LOGIN_BLOQUEIO_MINUTOS} minutos.`
      : `E-mail ou senha incorretos. ${restantes} tentativa(s) restante(s) antes do bloqueio temporário.`;
    renderLogin();
    return;
  }
  limparTentativasLogin(email);
  chamarLoginBloqueio('limpar', email).catch(() => {});
  valorSenhaLogin = ''; // não deixa a senha digitada residindo em memória além do necessário
  // se der certo, o listener onAuthStateChange cuida de iniciar o app
}
async function cadastrarLogin() {
  const nome = valorNomeLogin.trim();
  const email = valorEmailLogin.trim();
  const senha = valorSenhaLogin;
  const temConvite = document.getElementById('li-tem-convite').checked;
  const codigo = temConvite ? valorCodigoLogin.trim() : null;
  const nomeEmpresa = temConvite ? null : valorEmpresaLogin.trim();
  // Código de licença: obrigatório apenas quando NÃO há convite (ou seja,
  // quando a pessoa está tentando criar uma Empresa nova) — controle do
  // dono da plataforma (Instituto INETRIS), ver sql/11-licenciamento-empresas.sql.
  const codigoLicenca = temConvite ? null : valorCodigoLicencaLogin.trim();

  if (!nome) {
    erroLogin = 'Preencha seu nome.';
    renderLogin();
    return;
  }
  if (temConvite && !codigo) {
    erroLogin = 'Preencha o código de convite, ou desmarque a opção.';
    renderLogin();
    return;
  }
  if (!temConvite && !nomeEmpresa) {
    erroLogin = 'Preencha o nome da empresa, ou marque que tem um código de convite.';
    renderLogin();
    return;
  }
  if (!temConvite && !codigoLicenca) {
    erroLogin = 'Preencha o código de licença fornecido pelo Instituto INETRIS.';
    renderLogin();
    return;
  }
  if (!email) {
    erroLogin = 'Preencha o e-mail.';
    renderLogin();
    return;
  }
  if (!senha || senha.length < 6) {
    erroLogin = 'A senha precisa ter pelo menos 6 caracteres.';
    renderLogin();
    return;
  }
  if (!aceiteTermosLogin) {
    erroLogin = 'É necessário aceitar os Termos de Uso e a Política de Privacidade para criar a conta.';
    renderLogin();
    return;
  }

  carregandoLogin = true;
  erroLogin = null;
  renderLogin();
  const { error } = await sb.auth.signUp({
    email,
    password: senha,
    options: {
      data: {
        nome,
        nome_empresa: nomeEmpresa,
        codigo_convite: codigo,
        codigo_licenca: codigoLicenca,
        aceite_termos: true,
        aceite_termos_em: new Date().toISOString(),
      },
    },
  });
  carregandoLogin = false;
  if (error) {
    // A unicidade de e-mail do Supabase Auth é global na plataforma (um e-mail
    // = uma conta em toda a instância), não "por Empresa" como o PRD descreve.
    // Isso é mais restritivo do que o esperado: uma pessoa que precisasse
    // acessar duas Empresas diferentes (ex.: consultor) não pode reusar o
    // mesmo e-mail na segunda. É uma limitação de arquitetura conhecida,
    // não um bug — ver RECONCILIACAO-RN.md.
    const jaExiste = /already registered|already been registered|already exists|already in use|user already/i.test(
      error.message || ''
    );
    erroLogin = jaExiste
      ? 'Este e-mail já tem uma conta nesta plataforma. Cada e-mail só pode estar vinculado a uma Empresa por vez — se você precisa de acesso a outra Empresa, peça um convite para um e-mail diferente ou fale com o suporte.'
      : error.message; // aqui aparece, por exemplo, "Código de licença inválido ou já utilizado."
    renderLogin();
    return;
  }
  // E-mail de boas-vindas — não bloqueia nada se falhar (fire-and-forget).
  enviarEmailNotificacao(
    email,
    'Bem-vindo(a) à Plataforma NORTE',
    temConvite
      ? emailWrapperHTML(
          'Conta criada com sucesso!',
          `Olá, ${escaparHtml(nome)}! Sua conta na Plataforma NORTE foi criada com sucesso. Você já pode entrar com o e-mail e a senha que acabou de cadastrar.`
        )
      : emailWrapperHTML(
          'Conta criada com sucesso!',
          `Olá, ${escaparHtml(nome)}! A empresa <b>${escaparHtml(nomeEmpresa)}</b> foi cadastrada com sucesso na Plataforma NORTE, e você é a pessoa Administradora responsável por ela. Bem-vindo(a)!`
        )
  );
  // se der certo, o listener onAuthStateChange cuida de iniciar o app
}
function sair() {
  sb.auth.signOut().then(() => location.reload());
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
async function iniciarComSessao(sessao) {
  sessaoAtual = sessao;
  const { data: perfil, error } = await sb
    .from('perfis')
    .select('id, empresa_id, papel, nome, desativado, escopo_estendido, senha_provisoria')
    .eq('id', sessao.user.id)
    .single();
  if (error || !perfil) {
    console.error('Perfil não encontrado', error);
    return;
  }

  if (perfil.desativado) {
    await sb.auth.signOut();
    erroLogin = 'Esta conta foi desativada. Entre em contato com o administrador da sua empresa.';
    renderLogin();
    return;
  }

  // Senha provisória (acesso criado sem e-mail): força a troca antes de
  // entrar no sistema. A troca em si acontece em renderTrocaSenhaObrigatoria.
  if (perfil.senha_provisoria) {
    meuPerfilId = perfil.id;
    renderTrocaSenhaObrigatoria();
    return;
  }

  meuPerfilId = perfil.id;
  empresaIdAtual = perfil.empresa_id;
  meuPapelReal = perfil.papel;
  meuEscopoEstendido = !!perfil.escopo_estendido;

  // OTIMIZAÇÃO DE ABERTURA (v0.63.0): antes, cada consulta abaixo esperava a
  // anterior terminar (6 idas ao servidor em fila = 5-10s). Como estas quatro
  // não dependem uma da outra (só dependem do perfil, que já temos), disparamos
  // todas de uma vez com Promise.all — o tempo passa a ser o da mais lenta, não
  // a soma de todas. seed() roda antes pois carregarEstado preenche o state.
  seed(); // estado em branco antes de carregar
  let empresaCheck;
  try {
    [empresaCheck] = await Promise.all([
      sb
        .from('empresas')
        .select('acesso_suspenso, ponto_habilitado, trial_ate, is_pagante')
        .eq('id', perfil.empresa_id)
        .maybeSingle()
        .then((r) => r.data),
      sb
        .from('super_admins')
        .select('id')
        .eq('id', sessao.user.id)
        .maybeSingle()
        .then((r) => {
          souSuperAdmin = !!r.data;
        }),
      carregarEstado(),
      carregarUsuarios(), // popula _perfisEmpresa/_convitesEmpresa, usados também fora da aba Usuários
    ]);
  } catch (erroCarga) {
    // PROTEÇÃO CRÍTICA: se os dados não puderem ser confirmados como
    // carregados, NÃO seguimos como se estivesse tudo certo — isso é
    // exatamente o que causava perda de dados antes (ver 18-persistence.js).
    console.error('Falha ao carregar dados no login', erroCarga);
    empresaIdAtual = null; // desarma qualquer salvamento acidental
    erroLogin =
      'Não foi possível carregar os dados da sua empresa. Tente entrar novamente em alguns instantes — por segurança, nada foi alterado.';
    renderLogin();
    return;
  }

  if (empresaCheck?.acesso_suspenso) {
    await sb.auth.signOut();
    erroLogin =
      'O acesso da sua Empresa a esta plataforma está temporariamente suspenso. Entre em contato com o Instituto INETRIS para regularizar.';
    renderLogin();
    return;
  }
  // Teste grátis expirado: se a empresa está em trial (trial_ate preenchido),
  // já passou da data, e ainda não virou pagante, bloqueia o acesso (dia 8).
  // Os dados NÃO são apagados aqui — só o acesso é bloqueado (ver sql/24).
  if (empresaCheck?.trial_ate && !empresaCheck.is_pagante && new Date(empresaCheck.trial_ate) < new Date()) {
    await sb.auth.signOut();
    erroLogin =
      'Seu teste grátis de 7 dias expirou. Para continuar usando o sistema, assine um plano — fale com o Instituto INETRIS.';
    renderLogin();
    return;
  }
  // Guarda quando o trial expira, pra mostrar o aviso "faltam X dias" no topo.
  trialAte = empresaCheck?.trial_ate || null;
  // Módulo de Ponto é liga/desliga por Empresa (ver sql/21-ponto-por-empresa.sql).
  pontoHabilitado = !!empresaCheck?.ponto_habilitado;

  registrarAuditoria('usuario.login', { papel: meuPapelReal });

  aplicarTemaCoresInterface(state.configuracoes?.identidadeVisual?.corPrimaria);
  state.role = PAPEL_PARA_ROLE[meuPapelReal] || 'colaborador';
  state.route = 'dashboard_role';
  assinarAtualizacoesAoVivo();
  renderBotaoAtualizar(); // botão discreto de atualizar, sempre disponível
  render(); // já mostra a tela; notificações entram logo em seguida
  assinarNotificacoesAoVivo();
  carregarNotificacoes().then(render); // não bloqueia a abertura
}

// BUG CORRIGIDO (de vez, sem disputa de tempo): antes, duas rotinas
// competiam pra processar o mesmo link — a detecção automática do próprio
// supabase-js (agora desligada, ver js/01-supabase-client.js) e o nosso
// código abaixo. Dependendo de qual "ganhasse" primeiro, às vezes
// funcionava, às vezes abria o sistema direto. Agora só existe UM caminho:
// processamos a URL manualmente, uma única vez, de forma sequencial, antes
// de qualquer outra decisão.
let _tratandoLinkDeRecuperacao = false;

async function processarTokensDaUrlSeHouver() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  const tipo = hashParams.get('type') || searchParams.get('type');

  // Formato PKCE (?code=...)
  const code = searchParams.get('code');
  if (code) {
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    window.history.replaceState({}, document.title, window.location.pathname); // limpa a URL
    return { session: !error ? data?.session : null, tipo };
  }

  // Formato implícito (#access_token=...&refresh_token=...&type=recovery) —
  // com a detecção automática desligada, precisamos aplicar isso na mão.
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    window.history.replaceState({}, document.title, window.location.pathname);
    return { session: !error ? data?.session : null, tipo };
  }

  return { session: null, tipo: null };
}

// BUG CORRIGIDO: o Supabase dispara o evento inicial de sessão MUITO cedo
// (antes de todos os arquivos <script> da página terminarem de carregar) —
// por isso, chamar renderTelaAuth() direto aqui podia disparar um
// "renderTelaAuth is not defined", já que essa função só existe depois que
// js/35-tela-entrada.js (carregado bem mais tarde) termina de rodar. Em vez
// de reordenar todos os arquivos (arriscado), esperamos a função existir de
// verdade antes de chamar — tenta de novo a cada 50ms se ainda não existir.
function _chamarRenderTelaAuthQuandoPronto() {
  if (typeof renderTelaAuth !== 'function') {
    setTimeout(_chamarRenderTelaAuthQuandoPronto, 50);
    return;
  }
  renderTelaAuth();
}

sb.auth.onAuthStateChange((evento, sessao) => {
  if (_tratandoLinkDeRecuperacao) return; // já está na tela de nova senha — não deixa nenhum outro evento atropelar
  if (sessao) {
    sessaoAtual = sessao;
    // Só reinicia o app (recarrega dados e volta pro Dashboard) no primeiro login
    // desta aba. Renovações automáticas de sessão (TOKEN_REFRESHED, foco na aba,
    // etc.) não devem resetar a tela em que a pessoa está.
    if (!empresaIdAtual) {
      iniciarComSessao(sessao);
    }
  } else {
    sessaoAtual = null;
    empresaIdAtual = null;
    _cargaInicialOk = false;
    // BUG CORRIGIDO: este evento dispara sozinho assim que a página abre
    // (mesmo sem nenhuma sessão) — e chamar renderLogin() aqui direto
    // sobrescrevia a landing comercial que o outro trecho de inicialização
    // (mais abaixo) já tinha decidido mostrar. renderTelaAuth() respeita
    // _telaInicial: mostra a landing pra quem nunca logou nesta aba, e o
    // login pra quem acabou de sair (depois de já ter navegado até lá).
    _chamarRenderTelaAuthQuandoPronto();
  }
});

(async function iniciarApp() {
  // BUG CORRIGIDO: a trava (_tratandoLinkDeRecuperacao) só era ligada DEPOIS
  // de processar o token — mas trocar o token (setSession/exchangeCodeForSession)
  // já dispara o onAuthStateChange NO MEIO do processo, antes da trava
  // existir. Resultado: a tela de nova senha chegava a aparecer por um
  // instante, e logo em seguida o app "normal" (que já tinha sido disparado
  // por baixo dos panos) tomava conta da tela. Agora a trava liga ANTES de
  // qualquer troca de token acontecer, checando a URL de forma síncrona.
  const hashInicial = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchInicial = new URLSearchParams(window.location.search);
  const tipoDetectadoNaUrl = hashInicial.get('type') || searchInicial.get('type');
  if (tipoDetectadoNaUrl === 'recovery') _tratandoLinkDeRecuperacao = true;

  const { session: sessaoDoLink, tipo } = await processarTokensDaUrlSeHouver();

  if (tipo === 'recovery') {
    _tratandoLinkDeRecuperacao = true;
    if (sessaoDoLink) {
      sessaoAtual = sessaoDoLink;
      renderRedefinirSenha();
    } else {
      // Link expirado ou já usado (links de recuperação só funcionam uma vez).
      erroLogin = 'Este link de redefinição de senha expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';
      _tratandoLinkDeRecuperacao = false;
      renderLogin();
    }
    return;
  }

  if (sessaoDoLink) {
    // Outro tipo de link com token na URL (ex.: confirmação de cadastro) — entra normal.
    iniciarComSessao(sessaoDoLink);
    return;
  }

  // Sem nenhum token na URL — fluxo normal de quem já tinha sessão salva.
  const { data } = await sb.auth.getSession();
  if (data.session) {
    iniciarComSessao(data.session);
  } else {
    _chamarRenderTelaAuthQuandoPronto();
  }
})();

let erroRedefinirSenha = null;
let carregandoRedefinirSenha = false;
function renderRedefinirSenha() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;width:100%;">
      <div class="card" style="max-width:380px;width:100%;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
          ${compassSVG ? compassSVG() : ''}
          <div>
            <div class="brand-name">NORTE</div>
            <div class="brand-sub">Redefinir senha</div>
          </div>
        </div>
        <p class="page-desc">Digite a nova senha para a sua conta.</p>
        <div class="field"><label>Nova senha</label><input id="rs-senha" type="password" minlength="6" required></div>
        <div class="field"><label>Confirmar nova senha</label><input id="rs-senha-confirma" type="password" minlength="6" required></div>
        ${erroRedefinirSenha ? `<p style="color:var(--iniciar);font-size:12.5px;margin:-4px 0 12px;">${erroRedefinirSenha}</p>` : ''}
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="confirmarNovaSenha()" ${carregandoRedefinirSenha ? 'disabled' : ''}>
          ${carregandoRedefinirSenha ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </div>
    </div>`;
}
async function confirmarNovaSenha() {
  const senha = document.getElementById('rs-senha').value;
  const confirma = document.getElementById('rs-senha-confirma').value;
  if (!senha || senha.length < 6) {
    erroRedefinirSenha = 'A senha precisa ter pelo menos 6 caracteres.';
    renderRedefinirSenha();
    return;
  }
  if (senha !== confirma) {
    erroRedefinirSenha = 'As duas senhas digitadas são diferentes.';
    renderRedefinirSenha();
    return;
  }
  carregandoRedefinirSenha = true;
  erroRedefinirSenha = null;
  renderRedefinirSenha();
  const { error } = await sb.auth.updateUser({ password: senha });
  carregandoRedefinirSenha = false;
  if (error) {
    erroRedefinirSenha = 'Não foi possível salvar a nova senha. Tente pedir um novo link de redefinição.';
    renderRedefinirSenha();
    return;
  }
  showToast('Senha redefinida com sucesso!');
  await iniciarComSessao(sessaoAtual);
}
