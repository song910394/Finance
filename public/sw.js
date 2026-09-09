const CACHE_NAME = 'hs-finance-static-v2';
const OWN_OLD_CACHES = ['hs-finance-v1'];
const STATIC_PATH = /\.(?:html|js|css|json|svg|png|jpe?g|webp|ico|woff2?)$/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => OWN_OLD_CACHES.includes(name) || (name.startsWith('hs-finance-static-') && name !== CACHE_NAME)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  // Cloud/API traffic and other applications must never use this application's cache.
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || url.search || /\/api(?:\/|$)/i.test(url.pathname)) return;
  const relativePath = url.pathname.slice(scope.pathname.length);
  if (!(['', 'index.html', 'manifest.json'].includes(relativePath) || (/^(?:assets|icons)\//.test(relativePath) && STATIC_PATH.test(relativePath)))) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        try { const cache = await caches.open(CACHE_NAME); await cache.put(event.request, response.clone()); } catch { /* Cache failure must not hide a valid network response. */ }
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
