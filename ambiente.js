/* =========================================================
   AMBIENTE: produção ou teste
   -----------------------------------------------------------
   O sistema fala com o Supabase por um endereço e uma chave PÚBLICA (a chave "publishable", feita para ficar no
   navegador; a chave secreta de serviço NUNCA aparece no site). Aqui ficam os dois ambientes, e o ENDEREÇO DO SITE
   decide qual vale:
     - site de testes (endereço com "teste." no começo ou "-teste" no caminho) -> ambiente de TESTE;
     - qualquer outro (inclusive o site de hoje e o computador local)           -> PRODUÇÃO.
   Não existe jeito de trocar de ambiente por parâmetro na URL: o site de produção nunca fala com o banco de testes.

   Quando o projeto Supabase de testes existir, é só preencher "teste" abaixo (supabaseUrl e anonKey). Enquanto estiver
   vazio, o site de testes mostra um aviso e NÃO tenta falar com ninguém.

   Este arquivo é carregado ANTES de qualquer tela que use o Supabase (app, entrada, planos, vaga, vídeo e resultado).
   ========================================================= */
(function () {
  var AMBIENTES = {
    producao: {
      nome: 'producao',
      supabaseUrl: 'https://mgkmvrgfmuexgxkuslur.supabase.co',
      anonKey: 'sb_publishable_uOz0hehVdqv_7Q2LBzVbzg_J6ZH40fh',
    },
    teste: { nome: 'teste', supabaseUrl: '', anonKey: '' }, // preencher quando o projeto de testes for criado
  };

  // Decide o ambiente só pelo endereço do site (nunca por parâmetro da URL).
  function norteDetectarAmbiente(href) {
    var u;
    try {
      u = new URL(String(href));
    } catch (e) {
      return 'producao';
    }
    var host = u.hostname.toLowerCase();
    var caminho = u.pathname.toLowerCase();
    if (/^(teste|staging)\./.test(host)) return 'teste';
    if (/(^|\/)[^/]*-teste(\/|$)/.test(caminho)) return 'teste';
    return 'producao';
  }

  function montar(href) {
    var nome = norteDetectarAmbiente(href);
    var base = AMBIENTES[nome];
    return {
      nome: nome,
      supabaseUrl: base.supabaseUrl,
      anonKey: base.anonKey,
      configurado: !!(base.supabaseUrl && base.anonKey),
    };
  }

  var atual = montar(typeof location !== 'undefined' ? location.href : '');
  var alvo = typeof window !== 'undefined' ? window : this;
  alvo.NORTE_AMBIENTE = atual;
  alvo.norteDetectarAmbiente = norteDetectarAmbiente;
  alvo.norteMontarAmbiente = montar;

  // Faixa no topo do site de testes (para ninguém confundir com o ambiente real).
  if (atual.nome === 'teste' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      var faixa = document.createElement('div');
      faixa.setAttribute('role', 'status');
      faixa.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:' +
        (atual.configurado ? '#b45309' : '#b91c1c') +
        ';color:#fff;font:600 12px sans-serif;text-align:center;padding:4px 8px;';
      faixa.textContent = atual.configurado
        ? 'AMBIENTE DE TESTES — dados fictícios'
        : 'AMBIENTE DE TESTES ainda não configurado — nada aqui fala com o banco';
      document.body.appendChild(faixa);
    });
  }
})();
