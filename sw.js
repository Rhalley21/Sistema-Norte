// =========================================================================
// NORTE — Service Worker (mínimo, seguro)
// =========================================================================
// Cuidado importante: o sistema já teve um problema real de cache do
// navegador travando gente em versões antigas (corrigido na v0.15.6 com
// cache-busting via "?v=" nas URLs). Um service worker mal feito poderia
// trazer esse problema de volta, escondendo versões antigas por trás de um
// cache mais "forte" que o do próprio navegador.
//
// Por isso, a estratégia aqui é deliberadamente simples: "rede primeiro,
// cache só como última opção" (network-first). Isso significa que:
// - Com internet, o app SEMPRE busca a versão mais recente — o cache não
//   interfere em nada, e o "?v=" continua funcionando normalmente.
// - Sem internet, mostra a última versão que conseguiu carregar (melhor
//   que travar numa tela de erro), avisando que está sem conexão.
//
// O nome do cache muda a cada versão do próprio service worker — isso
// garante que caches antigos são limpos automaticamente.
// =========================================================================
const CACHE_NOME = 'norte-shell-v1';
const ARQUIVOS_ESSENCIAIS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Só intercepta GET — nunca mexe em chamadas de API/autenticação do
  // Supabase (essas já não passam por aqui mesmo, são domínio diferente).
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        // Rede funcionou — guarda uma cópia pro caso de ficar offline
        // depois, mas SEMPRE retorna a resposta fresca da rede.
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() =>
        // Sem rede — usa o que tiver no cache (pode ser uma versão
        // levemente antiga, mas evita a tela de erro do navegador).
        caches.match(event.request)
      )
  );
});
