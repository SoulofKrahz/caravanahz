// Enrutado por hash: #/inicio, #/mant, #/viajes, #/viaje/<id>, #/gastos, #/stats, #/ajustes (en la cabecera)
const routes = {};
let cleanup = null, current = null, guard = null;
/** guard(name) devuelve otra ruta si hay que redirigir (p. ej. antes de configurar el vehículo) */
export const setGuard = fn => (guard = fn);
const listeners = [];

// [ruta, nombre, icono, nombre corto para el modo sencillo]
export const NAV = [
  ['inicio', 'Inicio', 'home', 'Inicio'],
  ['mant', 'Mantenimiento', 'wrench', 'Revisiones'],
  ['viajes', 'Viajes', 'map', 'Viajes'],
  ['gastos', 'Gastos', 'euro', 'Gastos'],
  ['stats', 'Estadísticas', 'chart', 'Resumen'],
];

export const route = (name, fn) => (routes[name] = fn);
export const onRender = fn => listeners.push(fn);
export const go = path => { if (location.hash === '#/' + path) refresh(); else location.hash = '#/' + path; };

export function parse() {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  return { name: routes[name] ? name : 'inicio', params: rest.map(decodeURIComponent) };
}

/** Vuelve a pintar la vista actual (tras guardar algo). Conserva la posición del scroll. */
export async function refresh(keepScroll = true) {
  const { name, params } = parse();
  const to = guard && guard(name);
  if (to && to !== name) { location.replace('#/' + to); return; }
  const y = scrollY, same = current === name + params.join('/');
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  const view = document.getElementById('view');
  cleanup = (await routes[name](view, params)) || null;
  current = name + params.join('/');
  listeners.forEach(f => f(name));
  if (keepScroll && same) scrollTo(0, y); else scrollTo(0, 0);
}
addEventListener('hashchange', () => refresh());
