// Apuntes: la lista que hay detrás de una cifra del Resumen (coste total, un grupo, una categoría, un mes, el gasóleo,
// una zona de mantenimiento…). Cada apunte abre su ficha para verlo, corregirlo o borrarlo; al guardar, la lista
// y el total se recalculan. Atrás vuelve al Resumen.
//
// Dirección: #/apuntes/<filtro> con el filtro como parámetros de URL:
//   f, t   desde / hasta (fechas ISO, incluidas)
//   c      categorías separadas por «|» (vacío = todas)
//   k      'gastos' (por defecto) o 'revis' (registros de mantenimiento con coste, para «Gastado por zona»)
//   z      zona de mantenimiento (con k=revis)
//   tit    título; sub: periodo en palabras
import { D } from '../db.js';
import { esc, icon, fKm, fDate, fEur, fMonth, isSimple } from '../ui.js';
import { ZONA_ICO } from '../store.js';
import { expenseSheet, serviceSheet, askDeleteExpense } from '../forms.js';
import { refresh } from '../router.js';
import { rowE } from './gastos.js';

/** Dirección de una lista de apuntes (la usa el Resumen para enlazar cada cifra) */
export const apuntesHref = q => '#/apuntes/' + encodeURIComponent(new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString());

const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export function render(view, params = []) {
  const q = new URLSearchParams(params[0] || ''), from = q.get('f') || '0000-01-01', to = q.get('t') || '9999-12-31';
  const cats = (q.get('c') || '').split('|').filter(Boolean), kind = q.get('k') === 'revis' ? 'revis' : 'gastos', zona = q.get('z') || '';
  const title = q.get('tit') || (cats.length === 1 ? cats[0] : 'Apuntes'), sub = q.get('sub') || '';
  const inR = f => f && f >= from && f <= to;

  let items, total;
  if (kind === 'revis') {
    items = D.services.filter(s => inR(s.fecha) && +s.coste > 0 && (!zona || (s.zona || 'Otros') === zona)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    total = items.reduce((a, s) => a + (+s.coste || 0), 0);
  } else {
    items = D.expenses.filter(e => inR(e.fecha) && (!cats.length || cats.includes(e.cat))).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.upd || 0) - (a.upd || 0));
    total = items.reduce((a, e) => a + (+e.importe || 0), 0);
  }
  // Por meses, como en Gastos
  const groups = {}; items.forEach(x => (groups[x.fecha.slice(0, 7)] = groups[x.fecha.slice(0, 7)] || []).push(x));
  const val = x => +(kind === 'revis' ? x.coste : x.importe) || 0;
  // Si la lista mezcla categorías, un resumen por categoría arriba
  const byCat = {};
  if (kind === 'gastos') items.forEach(e => (byCat[e.cat] = (byCat[e.cat] || 0) + (+e.importe || 0)));
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const rowS = s => `<button class="row" data-s="${s.id}"><span class="ico">${icon(ZONA_ICO[s.zona] || 'wrench')}</span><span class="m"><b>${esc(s.nombre)}</b><small>${esc([fDate(s.fecha, { day: 'numeric', month: 'short' }), s.km ? fKm(s.km) : '', s.taller || '', s.gastoId ? '' : 'sin gasto apuntado'].filter(Boolean).join(' · '))}</small></span><span class="r"><b>${fEur(s.coste)}</b></span></button>`;

  view.innerHTML = `<div class="vh"><div><a class="back" href="#/stats" aria-label="Volver al resumen">${icon('left')}${isSimple() ? 'Resumen' : 'Estadísticas'}</a><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
    <div class="kpis k2">
      <div class="kpi"><span class="l">${icon('euro')}Total</span><span class="v">${fEur(total)}</span><span class="s">${pl(items.length, kind === 'revis' ? 'registro' : 'apunte', kind === 'revis' ? 'registros' : 'apuntes')}</span></div>
      <div class="kpi"><span class="l">${icon('cal')}Periodo</span><span class="v sm">${from > '0001' ? fDate(from, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span><span class="s">al ${fDate(to > '9000' ? new Date().toISOString().slice(0, 10) : to, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    </div>
    ${catRows.length > 1 ? `<div class="card" style="margin-top:12px"><div class="hbars">${catRows.map(([c, v]) => `<div class="hb"><b>${esc(c)}</b><span>${fEur(v)}</span><div class="t"><i style="width:${v / catRows[0][1] * 100}%"></i></div></div>`).join('')}</div></div>` : ''}
    ${kind === 'revis' ? `<p class="hint" style="margin:12px 4px 0">Mantenimientos con coste. Tócalo para ver o corregir el registro${items.some(s => !s.gastoId) ? '; los marcados «sin gasto apuntado» no suman en Gastos' : ''}.</p>` : `<p class="hint" style="margin:12px 4px 0">Toca un apunte para verlo o corregirlo. La papelera lo borra.</p>`}
    ${items.length ? Object.keys(groups).sort().reverse().map(m => `<div class="gh" data-m="${m}"><span>${fMonth(m + '-01')}</span><span>${fEur(groups[m].reduce((a, x) => a + val(x), 0))}</span></div>
      <div class="list" data-m="${m}">${groups[m].map(kind === 'revis' ? rowS : rowE).join('')}</div>`).join('')
      : `<div class="empty"><h3>No hay apuntes</h3><p>Ya no queda ninguno con este filtro.</p><a class="btn g back-to" href="#/stats">Volver al resumen</a></div>`}
    <div class="pb"></div>`;

  // «Volver» lo gestiona app.js (como el botón Atrás si vuelves a la pantalla de la que vienes)
  view.querySelectorAll('[data-e]').forEach(b => (b.onclick = () => expenseSheet(D.expenses.find(x => x.id === b.dataset.e))));
  view.querySelectorAll('[data-dx]').forEach(b => (b.onclick = () => askDeleteExpense(D.expenses.find(x => x.id === b.dataset.dx), refresh)));
  view.querySelectorAll('[data-s]').forEach(b => (b.onclick = () => { const s = D.services.find(x => x.id === b.dataset.s); serviceSheet(s.tareaId ? D.tasks.find(t => t.id === s.tareaId) || null : null, s); }));
}
