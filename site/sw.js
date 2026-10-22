// Service worker: la app abre al instante y funciona sin conexión (el mapa, las rutas y la búsqueda necesitan red).
//
// Cómo funciona (pensado para viajar con cobertura mala):
// - Al instalarse, guarda TODOS los archivos de esta versión de golpe. Si falla uno, no se instala y sigue la anterior:
//   nunca se mezclan archivos de dos versiones.
// - La app se sirve SIEMPRE desde lo guardado: no espera a la red, así que abre igual con una raya de cobertura.
// - Cada versión publicada trae un sw.js distinto; el navegador lo detecta, guarda la nueva en segundo plano y la app
//   avisa. La recarga nunca ocurre con un formulario a medias (lo decide la app, no el service worker).
// - Leaflet y las fuentes se guardan aparte (EXT) para no perderlas en cada actualización.
const V = 'cz-2026-10-22-7';
const EXT = 'cz-ext-1';
// './' y no 'index.html': Cloudflare Pages redirige /index.html → / y una respuesta redirigida no sirve para abrir la página
const SHELL = ['./', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/db.js', 'js/logic.js', 'js/ui.js', 'js/store.js', 'js/router.js', 'js/forms.js', 'js/valid.js', 'js/perfil.js', 'js/theme.js', 'js/install.js', 'js/atras.js',
  'js/mods/inicio.js', 'js/mods/mant.js', 'js/mods/viajes.js', 'js/mods/gastos.js', 'js/mods/combustible.js', 'js/mods/stats.js', 'js/mods/ajustes.js'];

self.addEventListener('install', e => {
  // cache: 'reload' evita que se cuele una copia vieja de la caché HTTP del navegador
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== EXT).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const EXT_HOSTS = /(^|\.)unpkg\.com$|^fonts\.(googleapis|gstatic)\.com$/;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('/version.txt')) return; // siempre a la red: sirve para saber si hay versión nueva
    // El manifest cambia según el color elegido (lo decide _worker.js por la cookie): de la red y, sin conexión, la copia
    if (u.pathname.endsWith('/manifest.webmanifest')) {
      e.respondWith(fetch(req).then(r => { if (r.ok) { const y = r.clone(); caches.open(V).then(c => c.put('manifest.webmanifest', y)); } return r; })
        .catch(() => caches.open(V).then(c => c.match('manifest.webmanifest'))));
      return;
    }
    // Páginas (abrir la app, recargar): el index.html guardado
    if (req.mode === 'navigate') {
      e.respondWith(caches.open(V).then(c => c.match('./')).then(r => r || fetch(req)));
      return;
    }
    e.respondWith(caches.open(V).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
    return;
  }
  if (EXT_HOSTS.test(u.hostname)) {
    e.respondWith(caches.open(EXT).then(c => c.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
  }
  // Mapa (teselas), rutas y búsqueda: directos a la red. La app ya avisa si no hay conexión.
});
