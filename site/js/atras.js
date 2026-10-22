// Botón Atrás del móvil, como en otras apps Android:
// - Las pantallas principales (Inicio, Revisiones, Viajes, Gastos, Resumen, Ajustes) no se apilan: cambiar
//   entre ellas sustituye la entrada del historial. Atrás desde cualquiera de ellas vuelve a Inicio.
// - Atrás en Inicio: «Pulsa atrás otra vez para salir». Una segunda pulsación antes de 3 s cierra la app.
// - Las pantallas de detalle (un viaje, completar el plan…) sí se apilan: Atrás vuelve a la anterior.
// - Las hojas y las preguntas se cierran con Atrás antes que nada (lo gestiona ui.js).
//
// Historial: [raíz #/inicio] [guarda: pantalla principal actual] [detalles…] [hojas…]
// Al llegar a la raíz con Atrás se vuelve a poner la guarda; solo si ya estabas en Inicio se avisa
// y se deja la raíz sola unos segundos: si pulsas otra vez, el historial se acaba y Android cierra la app.
import { toast } from './ui.js';
import { onRender, refresh } from './router.js';

const MAIN = new Set(['inicio', 'mant', 'viajes', 'gastos', 'stats', 'ajustes']);
const EXIT_MS = 3000;
const st = () => history.state || {};
let prev = st(), route = '', exitT = 0;

// Se anota el estado tras cada cambio para saber de dónde viene cada «Atrás»
const _push = history.pushState.bind(history), _rep = history.replaceState.bind(history);
history.pushState = (s, t, u) => { _push(s, t, u); prev = history.state; };
history.replaceState = (s, t, u) => { _rep(s, t, u); prev = history.state; };
const guard = () => history.pushState({ cz: 'guard' }, '', location.hash || '#/inicio');

/** Ir a una pantalla principal sin apilarla (barra de abajo, menú de arriba, Ajustes) */
export function goMain(path) {
  const h = '#/' + path;
  if (location.hash === h) return refresh();
  // Desde un detalle (p. ej. un viaje) se vuelve primero a la guarda para no dejar el detalle debajo
  history.replaceState(st().cz === 'root' ? st() : { ...st(), cz: st().cz || 'page' }, '', h);
  refresh();
}

/** Prepara el historial al abrir la app (una vez por sesión; en recargas por actualización se respeta) */
export function initBack() {
  let seen = false; try { seen = sessionStorage.getItem('cz_hist') === '1'; sessionStorage.setItem('cz_hist', '1'); } catch (e) {}
  if (!seen && st().cz !== 'root' && st().cz !== 'guard') {
    const h = location.hash || '#/inicio';
    history.replaceState({ cz: 'root' }, '', '#/inicio');
    history.pushState({ cz: 'guard' }, '', h);
  } else if (st().cz === 'root') guard();
  else if (st().sheet) history.replaceState({ cz: 'page' }, '', location.hash); // hoja que quedó abierta antes de recargar
}

onRender(name => (route = name));

addEventListener('popstate', () => {
  const from = prev; prev = st();
  if (from && from.sheet) return;                       // se ha cerrado una hoja (o la pregunta la ha vuelto a poner)
  if (document.querySelector('.sheet')) return;         // con una hoja abierta, Atrás es suyo
  if (st().cz !== 'root') return;                       // un detalle → la pantalla anterior
  if (route && route !== 'inicio') { guard(); return; } // desde otra pantalla principal → Inicio (lo pinta el router)
  // Ya estabas en Inicio: aviso, y si no vuelve a pulsar en 3 s, todo sigue como estaba
  clearTimeout(exitT);
  toast('Pulsa atrás otra vez para salir');
  exitT = setTimeout(() => { exitT = 0; if (st().cz === 'root') guard(); }, EXIT_MS);
});
