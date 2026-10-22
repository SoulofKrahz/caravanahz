// Caravanahz — Cloudflare Pages (modo avanzado, solo para el manifest; ver _routes.json).
// Icono según el color de la app (como en Noticiahz): la página guarda el color en la cookie cz_ic y aquí se sirve,
// en la misma dirección de siempre, el manifest de ese color (manifest-<color>.webmanifest). Android solo actualiza
// el icono de la app instalada si la dirección del manifest no cambia.
// Todo lo demás lo sirve Pages como archivos estáticos (no pasa por aquí y no gasta cuota).
const COLORS = ['turquesa', 'azul', 'indigo', 'violeta', 'rosa', 'coral', 'naranja', 'ambar', 'oliva', 'grafito'];

async function manifest(req, url, env) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)cz_ic=([a-z]+)/);
  const k = m && COLORS.includes(m[1]) ? m[1] : '';
  const r = await env.ASSETS.fetch(new Request(new URL(k ? `/manifest-${k}.webmanifest` : '/manifest.webmanifest', url), req));
  const h = new Headers(r.headers);
  h.set('Content-Type', 'application/manifest+json');
  h.set('Cache-Control', 'no-cache');
  h.set('Vary', 'Cookie');
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/manifest.webmanifest') {
      try { return await manifest(req, url, env); } catch (e) { return env.ASSETS.fetch(req); }
    }
    return env.ASSETS.fetch(req);
  },
};
