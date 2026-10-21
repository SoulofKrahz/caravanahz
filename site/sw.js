// Service worker: la app funciona sin conexión. El mapa, las rutas y la búsqueda necesitan red.
const V = 'cz-2026-10-21-2.1';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/db.js', 'js/logic.js', 'js/ui.js', 'js/store.js', 'js/router.js', 'js/forms.js', 'js/valid.js', 'js/perfil.js', 'js/theme.js', 'js/install.js',
  'js/mods/inicio.js', 'js/mods/mant.js', 'js/mods/viajes.js', 'js/mods/gastos.js', 'js/mods/combustible.js', 'js/mods/stats.js', 'js/mods/ajustes.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Archivos propios: red primero (para recibir cambios) y caché si no hay conexión
  if (u.origin === location.origin && u.pathname.endsWith('/version.txt')) return; // siempre a la red
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // Leaflet y fuentes: caché primero (no cambian)
  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(u.host)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(e.request, c)); return res; })));
  }
});
