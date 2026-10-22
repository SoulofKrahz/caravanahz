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
for (const f of walk(root).map(f => path.relative(root, f).split(path.sep).join('/')).filter(f => /\.(js|css)$/.test(f) && f !== 'sw.js'))
  if (!shell.includes(f)) fails.push('falta en el service worker (no funcionaría sin conexión): ' + f);
console.log(fails.length ? 'FALLA\n- ' + fails.join('\n- ') : `ok service worker ${V}: ${shell.length} archivos`);
process.exit(fails.length ? 1 : 0);
