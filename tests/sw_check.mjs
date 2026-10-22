// Comprueba el service worker antes de publicar (un fallo aquí = la app no abriría sin conexión en viaje):
// - su versión coincide con la de la app (si no, el móvil no se enteraría de la versión nueva)
// - guarda TODOS los archivos .js y .css de la app, y todos existen (uno que falte rompe la instalación)
import fs from 'node:fs'; import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'site');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const fails = [];
const V = (sw.match(/const V = 'cz-([^']+)'/) || [])[1], VER = (store.match(/export const VER = '([^']+)'/) || [])[1];
if (!V || V !== VER) fails.push(`sw.js (${V}) y store.js (${VER}) tienen versiones distintas`);
const shell = JSON.parse((sw.match(/const SHELL = (\[[\s\S]*?\]);/) || [])[1].replace(/'/g, '"'));
for (const f of shell) if (f !== './' && !fs.existsSync(path.join(root, f))) fails.push('el service worker guarda un archivo que no existe: ' + f);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(root).map(f => path.relative(root, f).split(path.sep).join('/')).filter(f => /\.(js|css)$/.test(f) && f !== 'sw.js' && !path.basename(f).startsWith('_')))
  if (!shell.includes(f)) fails.push('falta en el service worker (no funcionaría sin conexión): ' + f);
// _worker.js: con la cookie de cada color sirve el manifest de ese color (y el normal sin cookie o con una rara)
const W = (await import(path.join(root, '_worker.js'))).default;
const env = { ASSETS: { fetch: async r => { const f = path.join(root, new URL(r.url).pathname); return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('no', { status: 404 }); } } };
const theme = fs.readFileSync(path.join(root, 'js/theme.js'), 'utf8');
const slugs = [...theme.matchAll(/\['([^']+)', \d+/g)].map(m => m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
for (const k of ['', 'xx', ...slugs]) {
  const r = await W.fetch(new Request('https://x.dev/manifest.webmanifest', { headers: k ? { Cookie: 'a=1; cz_ic=' + k } : {} }), env);
  const j = await r.json().catch(() => null), want = slugs.includes(k) ? `ic/${k}-192.png` : 'icons/icon-192.png';
  if (!j || !j.icons || j.icons[0].src !== want) fails.push(`manifest con cz_ic=${k || '(nada)'}: esperaba ${want}`);
  else for (const ic of j.icons) if (!fs.existsSync(path.join(root, ic.src))) fails.push('falta el icono ' + ic.src);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const k of slugs) if (!html.includes(`['${k}',`) && !html.includes(`return'${k}'`)) fails.push(`czIco (index.html) no conoce el color ${k}`);
if (!fails.length) console.log(`ok manifest por color: ${slugs.length} colores + el de partida`);
console.log(fails.length ? 'FALLA\n- ' + fails.join('\n- ') : `ok service worker ${V}: ${shell.length} archivos`);
process.exit(fails.length ? 1 : 0);
