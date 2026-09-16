const CACHE = 'epi-manager-v2';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/manifest.webmanifest'])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navegação (o HTML da SPA): sempre busca da rede, sem fallback pra
  // cache. Servir uma cópia velha do app em silêncio quando a rede falha
  // por um instante é pior que um erro visível de "sem conexão" — já
  // fez o app instalado parecer com funcionalidades faltando pra quem
  // pegou uma versão presa de antes do deploy mais recente.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
