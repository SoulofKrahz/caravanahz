// Apariencia: tema, color de acento, tamaño del texto y animaciones.
// Lo necesario para pintar sin parpadeo se copia también en localStorage (cz_pf), que lee el <head>.
import { setKV } from './db.js';
import { prefs } from './store.js';

export const PRESETS = [
  ['Esmeralda', null, null], ['Turquesa', 185, .85], ['Azul', 214, .9], ['Índigo', 243, .8], ['Violeta', 272, .7],
  ['Rosa', 328, .75], ['Coral', 6, .85], ['Naranja', 27, .95], ['Ámbar', 42, .95], ['Oliva', 80, .55], ['Grafito', 215, .12],
];
export const FONT_SIZES = [['0.9', 'Pequeño'], ['1', 'Normal'], ['1.12', 'Grande'], ['1.25', 'Muy grande']];

const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const ESMERALDA = '#059669';

/** Vista previa del color de una muestra (tono medio) */
export function swatchHex(h, s) {
  if (h == null) return ESMERALDA;
  s = s * .8; const l = .4, a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => ('0' + Math.round(v * 255).toString(16)).slice(-2)).join('');
}
/** Tono y saturación de un color #rrggbb */
export function hexToHS(x) {
  const r = parseInt(x.slice(1, 3), 16) / 255, g = parseInt(x.slice(3, 5), 16) / 255, b = parseInt(x.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, Math.max(.1, Math.min(.95, +s.toFixed(2)))];
}
export function presetIndex(p = prefs()) {
  if (p.ah == null) return 0;
  return PRESETS.findIndex((x, i) => i && x[1] === p.ah && Math.abs(x[2] - p.as) < .005);
}

/** Aplica todo lo visual según las preferencias guardadas */
export function applyLook(p = prefs()) {
  const root = document.documentElement;
  const dark = p.theme === 'dark' || (p.theme !== 'light' && sysDark());
  root.classList.add('tm'); clearTimeout(applyLook.t); applyLook.t = setTimeout(() => root.classList.remove('tm'), 450);
  root.dataset.theme = dark ? 'dark' : 'light';
  const acc = window.czApply ? window.czApply(p.ah, p.as) : null;
  root.style.setProperty('--fs', p.fs || 1);
  root.classList.toggle('rm', !!p.reduceMotion);
  document.querySelector('meta[name=theme-color]').content = dark ? '#0d1523' : acc ? acc.barL : '#047857';
  // Favicon con el color elegido
  const col = acc ? acc.fav : ESMERALDA;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='15' fill='${col}'/><path d='M12 42V24a4 4 0 0 1 4-4h22l8 9h4a3 3 0 0 1 3 3v10' fill='none' stroke='%2306150f' stroke-width='5' stroke-linejoin='round'/><circle cx='21' cy='44' r='4.5' fill='white'/><circle cx='43' cy='44' r='4.5' fill='white'/><path d='M17 26h12v7H17z' fill='white'/></svg>`;
  document.querySelector('link[rel=icon]').href = 'data:image/svg+xml,' + svg.replace(/#/g, '%23');
  const th = document.querySelector('#th use'); if (th) th.setAttribute('href', dark ? '#i-sun' : '#i-moon');
  try { localStorage.setItem('cz_pf', JSON.stringify({ th: p.theme, ah: p.ah, as: p.as, fs: p.fs, rm: !!p.reduceMotion })); } catch (e) {}
}

export async function savePrefs(patch) {
  const p = { ...prefs(), ...patch };
  for (const k in patch) if (patch[k] === undefined) delete p[k];
  await setKV('prefs', p);
  applyLook(p);
  return p;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs().theme === 'auto') applyLook(); });
