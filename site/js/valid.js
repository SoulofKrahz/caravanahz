// Validación de formularios: reglas declarativas por campo + comprobaciones de conjunto.
// Los errores se muestran debajo de cada campo y el foco va al primero que falle.
import { isoToday, addMonths } from './logic.js';

/* Reglas que admite cada campo (además de k, l, t…):
   req: true | 'mensaje'      obligatorio
   min, max                   rango numérico
   int: true                  número entero
   dec: n                     máximo de decimales
   maxLen, minLen             longitud de texto
   past: true                 la fecha no puede ser futura
   minDate, maxDate           rango de fechas (ISO)
   pattern: [regex, 'mensaje']
   check: (valor, todos) => 'mensaje' | null
   norm: valor => valor       normaliza antes de comprobar y guardar */

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const n0 = v => nf.format(v);
const fd = iso => { const [y, m, d] = iso.split('-'); return `${+d}/${+m}/${y}`; };
export const normText = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export const normKey = s => normText(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Número escrito a la española: «1,459» o «1.459» (decimal) y «145.000» o «145 000» en enteros (miles).
 * Devuelve '' si está vacío y NaN si no es un número.
 */
export function parseNum(raw, int) {
  let s = String(raw ?? '').trim().replace(/\s/g, '').replace(/€|km|l$/gi, '');
  if (s === '') return '';
  if (int) { if (/,/.test(s)) return NaN; s = s.replace(/\.(?=\d{3}(\D|$))/g, ''); return /^\d+$/.test(s) ? +s : NaN; }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? +s : NaN;
}

/** Lee y comprueba un campo. Devuelve [valor, error|null] */
function fieldValue(el, f) {
  const i = el.querySelector(`[name="${f.k}"]`);
  if (!i) return [undefined, null];
  if (f.t === 'switch') return [i.checked, null];
  if (f.t === 'number') {
    if (i.validity && i.validity.badInput) return ['', 'Escribe solo un número'];
    const n = parseNum(i.value, f.int);
    return Number.isNaN(n) ? ['', f.int ? 'Escribe solo números enteros (sin coma)' : 'Escribe un número, p. ej. 1,459'] : [n, null];
  }
  if (f.t === 'date') {
    const v = i.value;
    if (i.validity && i.validity.badInput) return ['', 'Fecha no válida'];
    return [v, v && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'Fecha no válida' : null];
  }
  return [f.t === 'textarea' ? String(i.value).trim() : normText(i.value), null];
}

function ruleError(f, v, all) {
  const empty = v === '' || v === undefined || v === null;
  if (empty) return f.req ? (typeof f.req === 'string' ? f.req : `${f.l.replace(/\s*\(.*\)$/, '')}: obligatorio`) : null;
  if (f.t === 'number') {
    if (f.int && !Number.isInteger(v)) return 'Sin decimales';
    if (f.dec !== undefined && Math.abs(v * 10 ** f.dec - Math.round(v * 10 ** f.dec)) > 1e-6) return f.dec ? `Máximo ${f.dec} decimales` : 'Sin decimales';
    if (f.min !== undefined && v < f.min) return `Mínimo ${n0(f.min)}`;
    if (f.max !== undefined && v > f.max) return `Máximo ${n0(f.max)}`;
  }
  if (f.t === 'date') {
    if (f.past && v > isoToday()) return 'No puede ser una fecha futura';
    const mn = typeof f.minDate === 'function' ? f.minDate(all) : f.minDate, mx = typeof f.maxDate === 'function' ? f.maxDate(all) : f.maxDate;
    if (mn && v < mn) return `No puede ser anterior al ${fd(mn)}`;
    if (mx && v > mx) return `No puede ser posterior al ${fd(mx)}`;
    if (f.after && all[f.after] && v < all[f.after]) return f.afterMsg || `No puede ser anterior al ${fd(all[f.after])}`;
  }
  if (typeof v === 'string') {
    const max = f.maxLen ?? (f.t === 'textarea' ? 2000 : 80);
    if (v.length > max) return `Máximo ${max} caracteres (llevas ${v.length})`;
    if (f.minLen && v.length < f.minLen) return `Mínimo ${f.minLen} caracteres`;
  }
  if (f.pattern && !f.pattern[0].test(v)) return f.pattern[1];
  if (f.check) return f.check(v, all) || null;
  return null;
}

function mark(el, f, msg) {
  const i = el.querySelector(`[name="${f.k}"]`); if (!i) return;
  const box = i.closest('.fld') || i.closest('.swr');
  box.classList.toggle('bad', !!msg);
  i.setAttribute('aria-invalid', msg ? 'true' : 'false');
  let e = box.querySelector('.er');
  if (msg) { if (!e) { e = document.createElement('small'); e.className = 'er'; e.setAttribute('role', 'alert'); box.appendChild(e); } e.textContent = msg; }
  else if (e) e.remove();
}

/**
 * Valida el formulario. `extra(v)` devuelve errores de conjunto: [{k, msg}] o un texto general.
 * Devuelve los valores normalizados o null si hay errores.
 */
export function validate(el, fields, extra) {
  const v = {}, errs = [];
  const live = fields.filter(f => f.k && f.t !== 'section' && f.t !== 'note' && !isHidden(el, f));
  live.forEach(f => { const [val, e] = fieldValue(el, f); v[f.k] = f.norm && val !== '' && val !== undefined ? f.norm(val) : val; if (e) errs.push({ k: f.k, msg: e }); });
  // Los campos ocultos (p. ej. litros si no es combustible) no se validan y se vacían
  fields.filter(f => f.k && isHidden(el, f)).forEach(f => (v[f.k] = f.t === 'switch' ? false : ''));
  live.forEach(f => { if (!errs.some(x => x.k === f.k)) { const m = ruleError(f, v[f.k], v); if (m) errs.push({ k: f.k, msg: m }); } });
  let general = '';
  if (!errs.length && extra) {
    const x = extra(v);
    if (typeof x === 'string') general = x; else if (Array.isArray(x)) errs.push(...x.filter(e => e && e.msg));
  }
  live.forEach(f => mark(el, f, (errs.find(x => x.k === f.k) || {}).msg));
  // Si el error está en «Más datos», se despliega para que se vea
  errs.forEach(x => { const i = el.querySelector(`[name="${x.k}"]`), d = i && i.closest('details'); if (d) d.open = true; });
  const ge = el.querySelector('[data-err]');
  if (ge) { ge.hidden = !general; ge.textContent = general; }
  if (errs.length || general) {
    const first = errs.length ? el.querySelector(`[name="${errs[0].k}"]`) : ge;
    if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first.focus && errs.length) first.focus({ preventScroll: true }); }
    return null;
  }
  return v;
}
const isHidden = (el, f) => { const i = el.querySelector(`[name="${f.k}"]`); return !!(i && i.closest('[hidden]')); };

/** Quita el error de un campo en cuanto el usuario lo corrige */
export function liveClear(el) {
  el.addEventListener('input', e => {
    const box = e.target.closest('.fld.bad,.swr.bad'); if (!box) return;
    box.classList.remove('bad'); e.target.setAttribute('aria-invalid', 'false');
    const er = box.querySelector('.er'); if (er) er.remove();
  });
}

/**
 * Conecta el botón Guardar: valida, evita el doble clic y muestra errores inesperados.
 * save(v) puede devolver un texto de error para mostrarlo sin cerrar.
 */
export function onSubmit(sheetCtl, fields, extra, save, btnSel = '[data-save]') {
  const el = sheetCtl.el, btn = el.querySelector(btnSel);
  liveClear(el); linkDates(el, fields);
  const run = async () => {
    if (btn.disabled) return;
    const v = validate(el, fields, extra); if (!v) return;
    btn.disabled = true; sheetCtl.saving = true;
    try {
      const r = await save(v);
      if (typeof r === 'string') { if (r) { const ge = el.querySelector('[data-err]'); ge.hidden = false; ge.textContent = r; } btn.disabled = false; sheetCtl.saving = false; }
    } catch (e) {
      console.error(e);
      const ge = el.querySelector('[data-err]'); if (ge) { ge.hidden = false; ge.textContent = 'No se ha podido guardar: ' + (e.message || e); }
      btn.disabled = false; sheetCtl.saving = false;
    }
  };
  btn.onclick = run;
  // Intro en un campo de una línea = guardar
  // Intro pasa al siguiente campo (como indica el teclado del móvil); en el último, guarda
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('input:not([type=checkbox])')) return;
    e.preventDefault();
    const all = [...el.querySelectorAll('.sh-b input:not([type=checkbox]):not([type=hidden]), .sh-b select, .sh-b textarea')].filter(i => !i.closest('[hidden]') && !i.disabled);
    const next = all[all.indexOf(e.target) + 1];
    if (next && next.tagName !== 'TEXTAREA') { next.focus(); if (next.select && next.type !== 'date') next.select(); } else run();
  });
  // Atajos Hoy / Ayer / Anteayer en los campos de fecha
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-dq]'); if (!b) return;
    const i = el.querySelector(`[name="${b.dataset.for}"]`), d = new Date(); d.setDate(d.getDate() - +b.dataset.dq);
    i.value = isoToday(d); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/* ---------- Reglas reutilizables ---------- */
export const KM_MAX = 2000000;
export const R = {
  km: { int: true, min: 0, max: KM_MAX },
  money: (max = 50000) => ({ min: 0.01, max, dec: 2 }),
  dateRange: { minDate: '1950-01-01', maxDate: () => addMonths(isoToday(), 12 * 25) },
};

/** Matrícula: española moderna (0000 BBB), antigua provincial (PM 1234 AB) o extranjera */
export function normPlate(v) {
  const s = v.toUpperCase().replace(/[\s.-]/g, '');
  const m = s.match(/^(\d{4})([A-Z]{3})$/);
  if (m) return m[1] + ' ' + m[2];
  const o = s.match(/^([A-Z]{1,2})(\d{4})([A-Z]{1,2})$/);
  if (o) return `${o[1]}-${o[2]}-${o[3]}`;
  return s;
}
export function checkPlate(v) {
  const s = v.replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{3,10}$/.test(s)) return 'Solo letras y números (3 a 10)';
  const m = s.match(/^\d{4}([A-Z]{3})$/);
  if (m && /[AEIOUÑQ]/.test(m[1])) return 'Las matrículas españolas actuales no llevan vocales, Ñ ni Q';
  return null;
}

/**
 * Fechas encadenadas (campo con `after: 'otro'`): el selector no deja elegir una fecha anterior
 * y, si ya había una, avisa en el momento en vez de esperar a guardar.
 */
export function linkDates(el, fields) {
  fields.filter(f => f.t === 'date' && f.after).forEach(f => {
    const a = el.querySelector(`[name="${f.after}"]`), b = el.querySelector(`[name="${f.k}"]`);
    if (!a || !b) return;
    const sync = () => {
      if (a.value) b.min = a.value; else b.removeAttribute('min');
      const bad = a.value && b.value && b.value < a.value;
      mark(el, f, bad ? (f.afterMsg || `No puede ser anterior al ${fd(a.value)}`) : null);
    };
    a.addEventListener('change', sync); b.addEventListener('change', sync); sync();
  });
}
