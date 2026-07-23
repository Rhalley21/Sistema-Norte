const PAPEL_PARA_ROLE = { owner:'admin', rh:'rh', lider:'gestor', colaborador:'colaborador' };
let modoLogin = 'entrar'; // entrar | cadastrar
let temConviteLogin = false;
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

/* ---------- Bloqueio de login após 5 tentativas falhas (Fluxo de Navegação, Cap. 1.2) ----------
   Camada de UX no cliente, com persistência em localStorage (por e-mail) para
   sobreviver a um refresh da página. IMPORTANTE: isto não substitui um
   rate-limit real no backend — alguém que chame a API do Supabase diretamente
   (fora desta tela) não é bloqueado por este contador. Para bloqueio robusto,
   complementar com rate-limiting/Auth Hooks no próprio Supabase. */
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_BLOQUEIO_MINUTOS = 15;
function chaveTentativasLogin(email){ return `norte_login_tentativas_${email.toLowerCase().trim()}`; }
function lerTentativasLogin(email){
  try{
    const raw = localStorage.getItem(chaveTentativasLogin(email));
    return raw ? JSON.parse(raw) : { count:0, bloqueadoAte:null };
  }catch(e){ return { count:0, bloqueadoAte:null }; }
}
function salvarTentativasLogin(email, dados){
  try{ localStorage.setItem(chaveTentativasLogin(email), JSON.stringify(dados)); }catch(e){}
}
function statusBloqueioLogin(email){
  const dados = lerTentativasLogin(email);
  if(dados.bloqueadoAte && new Date(dados.bloqueadoAte) > new Date()){
    const minutosRestantes = Math.ceil((new Date(dados.bloqueadoAte) - new Date()) / 60000);
    return { bloqueado:true, minutosRestantes };
  }
  return { bloqueado:false };
}
function registrarTentativaFalha(email){
  const dados = lerTentativasLogin(email);
  dados.count = (dados.count||0) + 1;
  if(dados.count >= LOGIN_MAX_TENTATIVAS){
    const ate = new Date(); ate.setMinutes(ate.getMinutes() + LOGIN_BLOQUEIO_MINUTOS);
    dados.bloqueadoAte = ate.toISOString();
    dados.count = 0;
  }
  salvarTentativasLogin(email, dados);
  return dados;
}
function limparTentativasLogin(email){ salvarTentativasLogin(email, { count:0, bloqueadoAte:null }); }

function renderLogin(){
  const statusAtual = valorEmailLogin ? statusBloqueioLogin(valorEmailLogin) : { bloqueado:false };
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;width:100%;">
      <div style="width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:36px 32px;">
        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:22px;">
          ${compassSVGEstatico()}
          <div class="brand-name" style="margin-top:10px;font-size:22px;">NORTE</div>
          <div class="brand-sub">Instituto INETRIS</div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:18px;">
          <button class="btn ${modoLogin==='entrar'?'btn-primary':''}" style="flex:1;justify-content:center;" onclick="mudarModoLogin('entrar')">Entrar</button>
          <button class="btn ${modoLogin==='cadastrar'?'btn-primary':''}" style="flex:1;justify-content:center;" onclick="mudarModoLogin('cadastrar')">Cadastrar</button>
        </div>

        <form id="form-login" onsubmit="return false;">
          ${modoLogin==='cadastrar' ? `
            <div class="field"><label>Seu nome</label><input id="li-nome" type="text" required value="${valorNomeLogin}" oninput="valorNomeLogin=this.value;"></div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-dim);margin-bottom:12px;">
              <input type="checkbox" id="li-tem-convite" ${temConviteLogin?'checked':''} onchange="temConviteLogin=this.checked;renderLogin();">
              Tenho um código de convite de uma empresa
            </label>
            ${temConviteLogin
              ? `<div class="field"><label>Código de convite</label><input id="li-codigo" type="text" required value="${valorCodigoLogin}" oninput="valorCodigoLogin=this.value;"></div>`
              : `<div class="field"><label>Nome da empresa</label><input id="li-empresa" type="text" required value="${valorEmpresaLogin}" oninput="valorEmpresaLogin=this.value;"></div>`
            }
          ` : ''}
          <div class="field"><label>E-mail</label><input id="li-email" type="email" required value="${valorEmailLogin}" oninput="valorEmailLogin=this.value;"></div>
          <div class="field"><label>Senha</label><input id="li-senha" type="password" minlength="6" required value="${valorSenhaLogin}" oninput="valorSenhaLogin=this.value;"></div>
          ${modoLogin==='entrar' ? `<p style="text-align:right;margin:-6px 0 12px;"><a href="#" style="font-size:12.5px;color:var(--ink-dim);" onclick="esqueciSenhaLogin();return false;">Esqueci minha senha</a></p>` : ''}
          ${erroLogin ? `<p style="color:var(--iniciar);font-size:12.5px;margin:-4px 0 12px;">${erroLogin}</p>` : ''}
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="${modoLogin==='entrar'?'entrarLogin()':'cadastrarLogin()'}" ${carregandoLogin||statusAtual.bloqueado?'disabled':''}>
            ${carregandoLogin ? 'Aguarde…' : (statusAtual.bloqueado ? `Bloqueado (${statusAtual.minutosRestantes} min)` : (modoLogin==='entrar' ? 'Entrar' : 'Criar conta'))}
          </button>
        </form>
      </div>
    </div>
  `;
}
function compassSVGEstatico(){
  return `<div class="compass-wrap" style="width:72px;height:72px;">
    <img src="data:image/png;base64,${LOGO_INETRIS_B64}" alt="Instituto INETRIS" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;
}
function mudarModoLogin(m){ modoLogin = m; erroLogin = null; renderLogin(); }

async function esqueciSenhaLogin(){
  const email = valorEmailLogin.trim();
  if(!email){ erroLogin = 'Preencha o e-mail para receber o link de redefinição de senha.'; renderLogin(); return; }
  carregandoLogin = true; erroLogin = null; renderLogin();
  const { error } = await sb.auth.resetPasswordForEmail(email);
  carregandoLogin = false;
  erroLogin = error ? 'Não foi possível enviar o link agora. Tente novamente.' : 'Se este e-mail estiver cadastrado, enviamos um link de redefinição de senha.';
  renderLogin();
}

async function entrarLogin(){
  const email = valorEmailLogin.trim();
  const senha = valorSenhaLogin;
  if(!email || !senha){ erroLogin = 'Preencha e-mail e senha.'; renderLogin(); return; }

  const status = statusBloqueioLogin(email);
  if(status.bloqueado){
    erroLogin = `Muitas tentativas de login incorretas. Tente novamente em ${status.minutosRestantes} minuto(s).`;
    renderLogin();
    return;
  }

  carregandoLogin = true; erroLogin = null; renderLogin();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  carregandoLogin = false;
  if(error){
    const dados = registrarTentativaFalha(email);
    const restantes = LOGIN_MAX_TENTATIVAS - dados.count;
    erroLogin = dados.bloqueadoAte
      ? `Muitas tentativas incorretas. Login bloqueado por ${LOGIN_BLOQUEIO_MINUTOS} minutos.`
      : `E-mail ou senha incorretos. ${restantes} tentativa(s) restante(s) antes do bloqueio temporário.`;
    renderLogin();
    return;
  }
  limparTentativasLogin(email);
  valorSenhaLogin = ''; // não deixa a senha digitada residindo em memória além do necessário
  // se der certo, o listener onAuthStateChange cuida de iniciar o app
}
async function cadastrarLogin(){
  const nome = valorNomeLogin.trim();
  const email = valorEmailLogin.trim();
  const senha = valorSenhaLogin;
  const temConvite = document.getElementById('li-tem-convite').checked;
  const codigo = temConvite ? valorCodigoLogin.trim() : null;
  const nomeEmpresa = temConvite ? null : valorEmpresaLogin.trim();

  if(!nome){ erroLogin = 'Preencha seu nome.'; renderLogin(); return; }
  if(temConvite && !codigo){ erroLogin = 'Preencha o código de convite, ou desmarque a opção.'; renderLogin(); return; }
  if(!temConvite && !nomeEmpresa){ erroLogin = 'Preencha o nome da empresa, ou marque que tem um código de convite.'; renderLogin(); return; }
  if(!email){ erroLogin = 'Preencha o e-mail.'; renderLogin(); return; }
  if(!senha || senha.length < 6){ erroLogin = 'A senha precisa ter pelo menos 6 caracteres.'; renderLogin(); return; }

  carregandoLogin = true; erroLogin = null; renderLogin();
  const { error } = await sb.auth.signUp({
    email, password: senha,
    options: { data: { nome, nome_empresa: nomeEmpresa, codigo_convite: codigo } }
  });
  carregandoLogin = false;
  if(error){
    // A unicidade de e-mail do Supabase Auth é global na plataforma (um e-mail
    // = uma conta em toda a instância), não "por Empresa" como o PRD descreve.
    // Isso é mais restritivo do que o esperado: uma pessoa que precisasse
    // acessar duas Empresas diferentes (ex.: consultor) não pode reusar o
    // mesmo e-mail na segunda. É uma limitação de arquitetura conhecida,
    // não um bug — ver RECONCILIACAO-RN.md.
    const jaExiste = /already registered|already exists|user already/i.test(error.message||'');
    erroLogin = jaExiste
      ? 'Este e-mail já tem uma conta nesta plataforma. Cada e-mail só pode estar vinculado a uma Empresa por vez — se você precisa de acesso a outra Empresa, peça um convite para um e-mail diferente ou fale com o suporte.'
      : error.message;
    renderLogin();
  }
  // se der certo, o listener onAuthStateChange cuida de iniciar o app
}
function sair(){ sb.auth.signOut().then(()=>location.reload()); }

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
async function iniciarComSessao(sessao){
  sessaoAtual = sessao;
  const { data: perfil, error } = await sb.from('perfis').select('id, empresa_id, papel, nome, desativado, escopo_estendido').eq('id', sessao.user.id).single();
  if(error || !perfil){ console.error('Perfil não encontrado', error); return; }

  if(perfil.desativado){
    await sb.auth.signOut();
    erroLogin = 'Esta conta foi desativada. Entre em contato com o administrador da sua empresa.';
    renderLogin();
    return;
  }

  meuPerfilId = perfil.id;
  empresaIdAtual = perfil.empresa_id;
  meuPapelReal = perfil.papel;
  meuEscopoEstendido = !!perfil.escopo_estendido;

  registrarAuditoria('usuario.login', { papel: meuPapelReal });

  seed(); // estado em branco antes de carregar
  await carregarEstado();
  await carregarUsuarios(); // popula _perfisEmpresa/_convitesEmpresa, usados também fora da aba Usuários
  state.role = PAPEL_PARA_ROLE[meuPapelReal] || 'colaborador';
  state.route = 'dashboard_role';
  render();
}

sb.auth.onAuthStateChange((evento, sessao) => {
  if(sessao){
    sessaoAtual = sessao;
    // Só reinicia o app (recarrega dados e volta pro Dashboard) no primeiro login
    // desta aba. Renovações automáticas de sessão (TOKEN_REFRESHED, foco na aba,
    // etc.) não devem resetar a tela em que a pessoa está.
    if(!empresaIdAtual){ iniciarComSessao(sessao); }
  } else {
    sessaoAtual = null; empresaIdAtual = null; renderLogin();
  }
});

sb.auth.getSession().then(({ data }) => {
  if(data.session){ iniciarComSessao(data.session); }
  else { renderLogin(); }
});
