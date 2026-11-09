/* =========================================================
   TESTE GRÁTIS — QUANDO A PESSOA CHEGA AO SISTEMA
   -----------------------------------------------------------
   Quem pede o teste grátis recebe um código de licença. Antes, ao chegar ao sistema, a pessoa tinha de digitar de novo o
   nome, o e-mail, o nome da empresa e o código (à mão, no celular). Agora o cadastro já vem preenchido:

     - o CÓDIGO vem no endereço, depois do "#": app.html#cadastro&codigo=NORTE-XXXX-XXXX (é o botão do e-mail e o botão da
       tela de sucesso da página inicial). Depois do "#" o navegador não manda nada ao servidor;
     - NOME, E-MAIL e EMPRESA só vêm da sessão do navegador (a página inicial os guarda ao liberar o teste), e só quando a
       pessoa segue pelo mesmo navegador. Eles NUNCA vão no endereço: o endereço aparece em histórico, em e-mails e em
       ferramentas de monitoramento de erros.

   Depois de ler, o endereço e a sessão são limpos. Um código com formato errado é ignorado (nada é preenchido).

   Este arquivo só LÊ e preenche as variáveis do formulário de entrada (js/19-auth.js); quem desenha a tela é a de sempre.
   ========================================================= */

const CODIGO_TESTE_FORMATO = /^NORTE-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const PREFILL_CADASTRO_CHAVE = 'inetris_prefill_cadastro';

// O código que veio no endereço (#cadastro&codigo=...), ou null se não há ou se o formato não é de um código de teste.
function lerCodigoDoEndereco(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!p.has('cadastro')) return null;
  const codigo = String(p.get('codigo') || '')
    .trim()
    .toUpperCase();
  return CODIGO_TESTE_FORMATO.test(codigo) ? codigo : null;
}

// Nome, e-mail e empresa que a página inicial guardou na sessão do navegador (com limite de tamanho). Qualquer erro vira {}.
function lerPrefillDaSessao(armazenamento) {
  try {
    const bruto = armazenamento.getItem(PREFILL_CADASTRO_CHAVE);
    if (!bruto) return {};
    const d = JSON.parse(bruto);
    const t = (v, n) =>
      String(v == null ? '' : v)
        .trim()
        .slice(0, n);
    return { nome: t(d.nome, 120), email: t(d.email, 254), empresa: t(d.empresa, 160) };
  } catch (_) {
    return {};
  }
}

// Chamada na abertura, antes de desenhar a tela de entrada. Devolve true se preencheu o cadastro.
function aplicarPrefillCadastro() {
  const codigo = lerCodigoDoEndereco(window.location.hash);
  if (!codigo) return false;
  let pessoa = {};
  try {
    pessoa = lerPrefillDaSessao(window.sessionStorage);
  } catch (_) {
    pessoa = {}; // alguns navegadores bloqueiam o armazenamento: segue só com o código
  }
  modoLogin = 'cadastrar';
  temConviteLogin = false;
  valorCodigoLicencaLogin = codigo;
  if (pessoa.nome) valorNomeLogin = pessoa.nome;
  if (pessoa.email) valorEmailLogin = pessoa.email;
  if (pessoa.empresa) valorEmpresaLogin = pessoa.empresa;
  // Já usou: tira o código do endereço e os dados pessoais da sessão.
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (_) {}
  try {
    window.sessionStorage.removeItem(PREFILL_CADASTRO_CHAVE);
  } catch (_) {}
  return true;
}
