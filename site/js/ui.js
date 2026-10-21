// Utilidades de interfaz: formato, avisos, hojas modales y formularios.
import { parseISO, isoToday, daysBetween } from './logic.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const fKm = n => (n || n === 0 ? nf0.format(n) + ' km' : '—');
export const fNum = (n, d = 1) => (n || n === 0 ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(n) : '—');
/** Precio por litro, siempre con 3 decimales como en el surtidor: 1,600 */
export const fPpl = n => (+n).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const fEur = n => eur.format(+n || 0);
export const fEur0 = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(+n || 0);
export const fDate = (iso, o = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? parseISO(iso).toLocaleDateString('es-ES', o).replace('.', '') : '—');
export const fMonth = iso => parseISO(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
export const fDur = min => { if (!min && min !== 0) return '—'; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${m} min` : `${m} min`; };
export const nf = nf1;

/** «en 12 días», «hace 3 días», «hoy» */
export function rel(iso, today = isoToday()) {
  if (!iso) return '';
  const d = daysBetween(today, iso);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  const a = Math.abs(d), t = a < 60 ? `${a} días` : a < 730 ? `${Math.round(a / 30.4)} meses` : `${nf1.format(a / 365)} años`;
  return d > 0 ? 'en ' + t : 'hace ' + t;
}

export function ago(ts) { const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`; }

const ST = { ok: ['check', 'Al día'], soon: ['clock', 'Próximo'], over: ['alert', 'Vencido'], nd: ['edit', 'Sin datos'] };
// En modo sencillo, palabras de andar por casa: «Toca ya» en vez de «Vencido»
const ST_SIMPLE = { ok: 'Al día', soon: 'Pronto', over: 'Toca ya', nd: 'Falta fecha' };
export const stChip = (state, label) => `<span class="st ${state}">${icon(ST[state][0])}${esc(label || (isSimple() ? ST_SIMPLE[state] : ST[state][1]))}</span>`;
/** Unidades en palabras en modo sencillo */
export const uL100 = () => (isSimple() ? ' litros cada 100 km' : ' L/100 km');
export const uEurKm = () => (isSimple() ? ' € por km' : ' €/km');
export { isSimple };

/* ---------- Avisos ---------- */
let tt;
const isSimple = () => document.documentElement.classList.contains('simple');
export function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt);
  // En modo sencillo el aviso dura más (da tiempo a leerlo) y el móvil vibra un instante
  if (isSimple()) try { navigator.vibrate && navigator.vibrate(25); } catch (e) {}
  tt = setTimeout(() => t.classList.remove('show'), isSimple() ? 5000 : 2600);
}
let ut;
export function undo(msg, fn) {
  const u = $('#undo'); u.querySelector('span').textContent = msg; u.hidden = false;
  u.querySelector('button').onclick = () => { u.hidden = true; fn(); };
  clearTimeout(ut); ut = setTimeout(() => (u.hidden = true), isSimple() ? 12000 : 7000);
}

/* ---------- Preguntas (sustituye a confirm(): botones grandes y con texto claro) ----------
   ask({ title, text, ok: 'Sí, borrar', cancel: 'No', danger: true }) → Promise<boolean> */
export function ask({ title, text = '', ok = 'Sí', cancel = 'Cancelar', danger = false }) {
  return new Promise(res => {
    const ov = document.createElement('div'), dl = document.createElement('div');
    ov.className = 'ov show ask-ov'; dl.className = 'ask'; dl.setAttribute('role', 'alertdialog'); dl.setAttribute('aria-modal', 'true'); dl.setAttribute('aria-label', title);
    dl.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : ''}<div class="ask-b"><button class="btn g" data-no>${esc(cancel)}</button><button class="btn ${danger ? 'dd' : ''}" data-ok>${esc(ok)}</button></div>`;
    document.body.append(ov, dl);
    const prev = document.activeElement;
    const end = v => { ov.remove(); dl.remove(); removeEventListener('keydown', key, true); prev && prev.focus && prev.focus({ preventScroll: true }); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); end(false); } };
    addEventListener('keydown', key, true);
    dl.querySelector('[data-ok]').onclick = () => end(true);
    dl.querySelector('[data-no]').onclick = () => end(false);
    ov.onclick = () => end(false);
    setTimeout(() => dl.querySelector(danger ? '[data-no]' : '[data-ok]').focus(), 30);
  });
}
const DISCARD = { title: '¿Salir sin guardar?', text: 'Lo que has escrito se perderá.', ok: 'Salir sin guardar', cancel: 'Seguir escribiendo', danger: true };

/* ---------- Hojas modales (abajo en móvil, centradas en escritorio). El botón Atrás las cierra. ---------- */
const stack = [];
export function sheet({ title, body = '', foot = '', onMount, onClose, wide }) {
  const host = $('#sheets'), ov = document.createElement('div'), sh = document.createElement('div');
  ov.className = 'ov';
  sh.className = 'sheet';
  if (wide) sh.style.width = 'min(820px,calc(100vw - 32px))';
  sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
  sh.innerHTML = `<div class="sh-h"><h2>${esc(title)}</h2><button class="ib" data-x aria-label="Cerrar">${icon('x')}</button></div>
    <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}`;
  host.append(ov, sh);
  requestAnimationFrame(() => ov.classList.add('show'));
  document.body.classList.add('lock');
  const prev = document.activeElement;
  let done; const gone = new Promise(r => (done = r));
  const ctl = { el: sh, body: $('.sh-b', sh), closed: false };
  const finish = () => {
    if (ctl.closed) return; ctl.closed = true; done();
    ov.remove(); sh.remove();
    stack.splice(stack.indexOf(ctl), 1);
    if (!stack.length) document.body.classList.remove('lock');
    onClose && onClose();
    prev && prev.focus && prev.focus({ preventScroll: true });
  };
  ctl.finish = finish;
  /** Cierra la hoja; la promesa se resuelve cuando el historial ya ha vuelto atrás (para navegar o abrir otra hoja después) */
  ctl.close = () => { if (!ctl.closed) { ctl.closing = true; if (history.state && history.state.sheet === ctl.id) history.back(); else finish(); } return gone; };
  /** Cierre pedido por el usuario (fuera, X, Esc, arrastrar): si ha escrito algo, pregunta antes de perderlo */
  ctl.dirty = false;
  ctl.tryClose = async () => { if (ctl.dirty && !ctl.saving && !(await ask(DISCARD))) return false; ctl.close(); return true; };
  sh.addEventListener('input', e => { if (e.target.matches('.sh-b input:not([type=search]), .sh-b textarea, .sh-b select')) ctl.dirty = true; });
  sh.addEventListener('change', e => { if (e.target.matches('.sh-b input:not([type=search]), .sh-b textarea, .sh-b select')) ctl.dirty = true; });
  ctl.id = Math.random();
  history.pushState({ sheet: ctl.id }, '');
  stack.push(ctl);
  ov.onclick = ctl.tryClose;
  $('[data-x]', sh).onclick = ctl.tryClose;
  dragToClose(sh, ov, ctl.tryClose);
  onMount && onMount(ctl);
  const f = $('input:not([type=checkbox]),select,textarea', sh);
  if (f && matchMedia('(hover:hover)').matches) f.focus({ preventScroll: true });
  return ctl;
}
addEventListener('popstate', () => {
  const top = stack[stack.length - 1]; if (!top) return;
  // Botón Atrás del móvil con datos sin guardar: se pregunta; si cancela, la hoja sigue abierta
  if (!top.closing && top.dirty && !top.saving) {
    // Atrás con algo escrito: la hoja sigue abierta y se pregunta; si decide salir, se cierra de verdad
    history.pushState({ sheet: top.id }, '');
    ask(DISCARD).then(go => { if (go) top.close(); });
    return;
  }
  top.finish();
});
addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length && !document.querySelector('.ask')) stack[stack.length - 1].tryClose(); });

/* Teclado del móvil: la hoja se recoloca encima del teclado (iOS no redimensiona la página) */
if (window.visualViewport) {
  const fit = () => {
    const top = stack[stack.length - 1]; if (!top || !matchMedia('(max-width:760px)').matches) return;
    const vv = visualViewport, kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    top.el.style.bottom = kb > 60 ? kb + 'px' : '';
    top.el.style.maxHeight = kb > 60 ? (vv.height - 12) + 'px' : '';
    const a = document.activeElement;
    if (kb > 60 && a && top.el.contains(a) && a.scrollIntoView) setTimeout(() => a.scrollIntoView({ block: 'center' }), 60);
  };
  visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit);
}
export const closeAllSheets = () => { while (stack.length) stack[stack.length - 1].finish(); };

function dragToClose(sh, ov, close) {
  let y0 = 0, dy = 0, on = false;
  const mob = () => matchMedia('(max-width:760px)').matches;
  sh.addEventListener('touchstart', e => { if (!mob() || e.touches.length !== 1) return; y0 = e.touches[0].clientY; dy = 0; on = false; }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (!mob()) return;
    const d = e.touches[0].clientY - y0, b = $('.sh-b', sh);
    if (!on) { if (d > 10 && b.scrollTop <= 0 && !e.target.closest('input,textarea,select,.mapw')) on = true; else return; }
    dy = Math.max(0, d); sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; ov.style.opacity = String(Math.max(0, 1 - dy / sh.offsetHeight)); e.preventDefault();
  }, { passive: false });
  sh.addEventListener('touchend', () => {
    if (!on) return; on = false; sh.style.transition = 'transform .2s ease';
    if (dy > 100) { sh.style.transform = 'translateY(100%)'; setTimeout(async () => { if (!(await close())) { sh.style.transform = ''; ov.style.opacity = ''; } }, 180); }
    else { sh.style.transform = ''; ov.style.opacity = ''; }
  }, { passive: true });
}

/* ---------- Formularios declarativos ----------
   campos: {k, l (etiqueta), t: text|number|date|select|textarea|switch|section, o: opciones, full, step, min, ph, help, req} */
export function form(fields, v = {}) {
  // En modo sencillo, los campos opcionales (adv) van plegados en «Más datos (opcional)»
  const fold = isSimple(), main = fields.filter(f => !(fold && f.adv)), extra = fold ? fields.filter(f => f.adv) : [];
  return '<div class="form">' + fieldsHtml(main, v)
    + (extra.length ? `<details class="more full"><summary>Más datos (opcional)</summary><div class="form">${fieldsHtml(extra, v)}</div></details>` : '')
    + '<p class="fm err full" data-err hidden role="alert"></p></div>';
}
function fieldsHtml(fields, v) {
  return fields.map(f => {
    if (f.t === 'section') return `<div class="fsec">${esc(f.l)}</div>`;
    if (f.t === 'note') return `<p class="hint full" style="margin-top:-4px">${esc(f.l)}</p>`;
    const val = v[f.k] ?? f.def ?? '', cls = 'fld' + (f.full || f.t === 'textarea' || f.t === 'switch' ? ' full' : '');
    const help = f.help ? `<small>${esc(f.help)}</small>` : '';
    const req = f.req ? ' aria-required="true"' : '';
    const lab = esc(f.l) + (f.req ? ' <i class="rq" aria-hidden="true">*</i>' : '');
    if (f.t === 'switch') return `<label class="swr full"><span><b>${esc(f.l)}</b>${f.help ? `<small>${esc(f.help)}</small>` : ''}</span><span class="sw"><input type="checkbox" name="${f.k}" ${val ? 'checked' : ''}><span></span></span></label>`;
    let inp;
    if (f.t === 'select') inp = `<select name="${f.k}"${req}>${f.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    else if (f.t === 'textarea') inp = `<textarea name="${f.k}" placeholder="${esc(f.ph || '')}" maxlength="${(f.maxLen || 2000) + 50}"${req}>${esc(val)}</textarea>`;
    else {
      let a = '';
      if (f.t === 'number') a = `inputmode="${f.int ? 'numeric' : 'decimal'}" enterkeyhint="next" spellcheck="false"`;
      else if (f.t === 'date') a = (typeof f.minDate === 'string' ? ` min="${f.minDate}"` : '') + (f.past ? ` max="${isoToday()}"` : '');
      else a = `maxlength="${(f.maxLen || 80) + 20}" enterkeyhint="next"` + (f.t === 'tel' ? ' inputmode="tel"' : '');
      // Los números van como texto: así se puede escribir con coma decimal (1,459) en cualquier móvil
      // Enteros con punto de miles (145.120) y decimales con coma (1,459), como se escriben en España
      const shown = f.t === 'number' && val !== '' && val != null && !isNaN(+val) ? (f.int ? nf0.format(+val) : String(val).replace('.', ',')) : val;
      const dl = f.sug && f.sug.length ? `dl-${f.k}` : '';
      inp = `<input name="${f.k}" type="${f.t === 'number' ? 'text' : f.t || 'text'}" value="${esc(shown)}" placeholder="${esc(f.ph || '')}" ${a}${req} autocomplete="off"${dl ? ` list="${dl}"` : ''}>`
        + (dl ? `<datalist id="${dl}">${f.sug.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '')
        // Atajos de fecha: Hoy / Ayer / Anteayer
        + (f.t === 'date' && f.quick ? `<span class="dq">${[[0, 'Hoy'], [1, 'Ayer'], [2, 'Anteayer']].map(([d, t]) => `<button type="button" data-dq="${d}" data-for="${f.k}">${t}</button>`).join('')}</span>` : '');
    }
    return `<label class="${cls}"><span>${lab}</span>${inp}${help}</label>`;
  }).join('');
}
export function download(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
