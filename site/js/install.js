// Instalar la app (como en Noticiahz): aviso en Inicio y opción en Ajustes → Avanzado.
// Android/Chrome/Edge: se usa el diálogo del navegador (beforeinstallprompt).
// iPhone/iPad: Safari no tiene ese diálogo, así que se explica cómo hacerlo desde «Compartir».
import { toast } from './ui.js';

const K = { inst: 'cz_inst', snooze: 'cz_iz', count: 'cz_ic' };
const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let ipr = null;
const listeners = [];
const changed = () => listeners.forEach(f => { try { f(); } catch (e) {} });

/** Abierta como app instalada (pantalla completa desde el icono) */
export const isApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
/** iPhone o iPad (el iPad moderno se presenta como Mac con pantalla táctil) */
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
/** El navegador ofrece su diálogo de instalación */
export const canPrompt = () => !!ipr;
export const installed = () => isApp() || get(K.inst, 0) === 1;
export const onChange = fn => listeners.push(fn);

/** ¿Mostrar el aviso en Inicio? Como mucho 3 veces y no antes de 14 días tras «Ahora no» */
export function bannerDue() {
  if (isApp() || get(K.inst, 0) === 1) return false;
  if (!ipr && !isIOS()) return false;
  return (get(K.snooze, 0) || 0) < Date.now() && (get(K.count, 0) || 0) < 3;
}
export function bannerText() {
  return ipr ? 'Instala Caravanahz: se abre desde su icono, a pantalla completa y funciona sin conexión.'
    : 'Instala Caravanahz: pulsa Compartir (el cuadrado con la flecha) y luego «Añadir a pantalla de inicio».';
}
export function snooze() {
  set(K.snooze, Date.now() + 14 * 864e5);
  set(K.count, ipr ? (get(K.count, 0) || 0) + 1 : 3); // en iPhone el aviso solo explica: no insistir
  changed();
}
export async function install() {
  if (!ipr) { if (isIOS()) toast('Pulsa Compartir y luego «Añadir a pantalla de inicio»'); return false; }
  ipr.prompt();
  let ok = false;
  try { ok = (await ipr.userChoice).outcome === 'accepted'; } catch (e) {}
  ipr = null;
  if (!ok) snooze(); else changed();
  return ok;
}

if (isApp()) set(K.inst, 1); // abierta como app: se recuerda (el almacenamiento se comparte con el navegador)
addEventListener('beforeinstallprompt', e => {
  if (isApp()) return;
  e.preventDefault(); ipr = e;
  set(K.inst, 0); // si el navegador ofrece instalar, es que ahora no está instalada
  changed();
});
addEventListener('appinstalled', () => { ipr = null; set(K.inst, 1); toast('App instalada: ábrela desde su icono'); changed(); });
