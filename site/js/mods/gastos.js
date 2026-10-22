import { D } from '../db.js';
import { esc, icon, fKm, fDate, fEur, fEur0, fNum, fPpl, fMonth, rel, stChip, download, toast } from '../ui.js';
import { ctx, docsWithStatus, CATS, CAT_ICO, vehicle } from '../store.js';
import { buildCSV, isoToday } from '../logic.js';
import { expenseSheet, docSheet } from '../forms.js';
import { kmInYear } from './inicio.js';
import { renderFuel } from './combustible.js';
import { normKey } from '../valid.js';

let tab = 'gastos', year = String(new Date().getFullYear()), cat = '';

export function render(view, params = []) {
  if (params[0] && ['gastos', 'combustible', 'docs'].includes(params[0])) tab = params[0];
  const tabs = [['gastos', 'Gastos'], ['combustible', 'Combustible'], ['docs', 'Documentos']];
  const dw = docsWithStatus(ctx()), docAlert = dw.filter(x => x.s.state !== 'ok').length;
  view.innerHTML = `<div class="vh"><div><h1>Gastos y documentos</h1></div></div>
    <div class="tools"><div class="seg" id="seg">${tabs.map(([k, l]) => `<button data-v="${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'docs' && docAlert ? ` (${docAlert})` : ''}</button>`).join('')}</div></div>
    <div id="body"></div><div class="pb"></div>`;
  view.querySelector('#seg').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; history.replaceState(history.state, '', '#/gastos/' + tab); render(view, [tab]); } };
  const body = view.querySelector('#body');
  ({ gastos, docs: docsTab, combustible: renderFuel })[(tab === 'cons' ? 'combustible' : tab)](body, dw);
}

function gastos(el) {
  const years = [...new Set([String(new Date().getFullYear()), ...D.expenses.map(e => (e.fecha || '').slice(0, 4)).filter(Boolean)])].sort().reverse();
  if (!years.includes(year)) year = years[0];
  const inY = D.expenses.filter(e => (e.fecha || '').startsWith(year));
  const list = inY.filter(e => !cat || e.cat === cat).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.upd || 0) - (a.upd || 0));
  const tot = inY.reduce((s, e) => s + (+e.importe || 0), 0), km = kmInYear(+year);
  const groups = {}; list.forEach(e => (groups[e.fecha.slice(0, 7)] = groups[e.fecha.slice(0, 7)] || []).push(e));

  el.innerHTML = `<div class="tools"><select id="yr" aria-label="Año">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="ct" aria-label="Categoría"><option value="">Todas las categorías</option>${CATS.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <span style="flex:1"></span><button class="tb" id="csv">${icon('dl')}CSV</button><button class="btn" id="add">${icon('plus')}Gasto</button></div>
    <div class="kpis k3">
      <div class="kpi"><span class="l">Total ${year}</span><span class="v">${fEur0(tot)}</span><span class="s">${inY.length} apuntes</span></div>
      <div class="kpi"><span class="l">Coste por km</span><span class="v">${km ? fNum(tot / km, 2) + ' €/km' : '—'}</span><span class="s">${km ? 'sobre ' + fKm(km) : 'Faltan km registrados'}</span></div>
      <div class="kpi"><span class="l">Media mensual</span><span class="v">${fEur0(tot / (year === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : 12))}</span><span class="s">incluye seguro e impuestos</span></div>
    </div>
    ${inY.length ? `<a class="lnk" href="#/stats">${icon('chart')}Ver el análisis por mes, categoría y viaje en Estadísticas${icon('right')}</a>` : ''}
    ${inY.length > 4 ? `<div class="srch" style="margin:4px 0 6px">${icon('pin')}<input id="gq" type="search" placeholder="Buscar en ${year}: gasolinera, peaje, viaje…" autocomplete="off" aria-label="Buscar gastos"></div><p class="hint" id="gqn" hidden></p>` : ''}
    ${list.length ? Object.keys(groups).sort().reverse().map(m => `<div class="gh" data-m="${m}"><span>${fMonth(m + '-01')}</span><span>${fEur(groups[m].reduce((s, e) => s + (+e.importe || 0), 0))}</span></div><div class="list" data-m="${m}">${groups[m].map(rowE).join('')}</div>`).join('')
      : `<div class="empty"><h3>Sin gastos${cat ? ' en ' + esc(cat) : ''} en ${year}</h3><p>Registra repostajes, áreas, peajes y reparaciones para saber cuánto te cuesta de verdad.</p><button class="btn" id="add2">${icon('plus')}Añadir gasto</button></div>`}`;

  el.querySelector('#yr').onchange = e => { year = e.target.value; gastos(el); };
  el.querySelector('#ct').onchange = e => { cat = e.target.value; gastos(el); };
  el.querySelector('#add').onclick = () => expenseSheet({}, cat ? { cat } : {});
  const a2 = el.querySelector('#add2'); if (a2) a2.onclick = () => expenseSheet({}, cat ? { cat } : {});
  el.querySelector('#csv').onclick = () => exportCSV();
  const gq = el.querySelector('#gq');
  if (gq) gq.oninput = () => {
    const k = normKey(gq.value); let n = 0, sum = 0;
    el.querySelectorAll('.list[data-m]').forEach(l => {
      let any = false;
      l.querySelectorAll('[data-q]').forEach(r => { const ok = !k || r.dataset.q.includes(k); r.hidden = !ok; if (ok) { any = true; n++; sum += +(D.expenses.find(x => x.id === r.dataset.e) || {}).importe || 0; } });
      l.hidden = !any; el.querySelector(`.gh[data-m="${l.dataset.m}"]`).hidden = !any;
    });
    const p = el.querySelector('#gqn'); p.hidden = !k; p.textContent = n ? `${n} ${n === 1 ? 'gasto' : 'gastos'} · ${fEur(sum)}` : 'Nada coincide con la búsqueda';
  };
  el.querySelectorAll('[data-e]').forEach(b => (b.onclick = () => expenseSheet(D.expenses.find(x => x.id === b.dataset.e))));
}

function rowE(e) {
  const trip = e.viajeId && D.trips.find(t => t.id === e.viajeId);
  const sub = [fDate(e.fecha, { day: 'numeric', month: 'short' }), e.cat === 'Combustible' && e.litros ? `${fNum(e.litros)} L · ${fPpl(e.importe / e.litros)} €/L${e.lleno ? ' · lleno' : ''}` : e.cat, e.km ? fKm(e.km) : '', trip ? trip.nombre : ''].filter(Boolean).join(' · ');
  const q = normKey([e.concepto, e.cat, e.notas, trip && trip.nombre, String(e.importe).replace('.', ',')].filter(Boolean).join(' '));
  return `<button class="row" data-e="${e.id}" data-q="${esc(q)}"><span class="ico">${icon(CAT_ICO[e.cat] || 'euro')}</span><span class="m"><b>${esc(e.concepto || e.cat)}</b><small>${esc(sub)}</small></span><span class="r"><b>${fEur(e.importe)}</b></span></button>`;
}

export function exportCSV() {
  const rows = [['Fecha', 'Categoría', 'Concepto', 'Importe', 'Litros', 'Precio/L', 'Lleno', 'Km', 'Viaje', 'Notas']];
  D.expenses.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(e => {
    const t = e.viajeId && D.trips.find(x => x.id === e.viajeId);
    rows.push([e.fecha, e.cat, e.concepto || '', String(e.importe).replace('.', ','), e.litros ? String(e.litros).replace('.', ',') : '', e.litros ? (e.importe / e.litros).toFixed(3).replace('.', ',') : '', e.lleno ? 'sí' : '', e.km || '', t ? t.nombre : '', e.notas || '']);
  });
  download(`caravanahz-gastos-${isoToday()}.csv`, buildCSV(rows), 'text/csv;charset=utf-8');
  toast('Gastos exportados');
}

/** «ITV · ITV Lleida» → «ITV Lleida» */
export const docName = d => (d.nombre && normKey(d.nombre).includes(normKey(d.tipo)) ? d.nombre : d.tipo + (d.nombre ? ' · ' + d.nombre : ''));

function itvHint() {
  const c = vehicle().catITV;
  if (c === 'M1') return 'Tu autocaravana es M1 y tiene más de 10 años: ITV cada año (RD 920/2017). Al renovarla te propongo la fecha a un año.';
  if (c === 'N') return 'Tu ficha técnica es de categoría N y tiene más de 10 años: ITV cada 6 meses (RD 920/2017). Al renovarla te propongo la fecha a 6 meses.';
  return 'Con más de 10 años, la ITV es anual si la ficha técnica dice M1 (autocaravana) y cada 6 meses si es categoría N (vivienda sobre furgón). Indica tu categoría en Ajustes → Vehículo.';
}
function docsTab(el, dw) {
  el.innerHTML = `<div class="tools"><span class="hint" style="flex:1">Te aviso en Inicio y en la exportación al calendario.</span><button class="btn" id="add">${icon('plus')}Documento</button></div>
    ${dw.length ? `<div class="list">${dw.map(({ d, s }) => `<button class="row" data-d="${d.id}"><span class="ico">${icon('doc')}</span><span class="m"><b>${esc(docName(d))}</b><small>Caduca el ${fDate(d.vence)} (${rel(d.vence)})${d.importe ? ' · ' + fEur(d.importe) : ''}</small></span>${stChip(s.state, s.state === 'over' ? 'Caducado' : s.state === 'soon' ? 'Renovar' : 'Vigente')}</button>${d.tel ? `<a class="row call" href="tel:${esc(String(d.tel).replace(/[^+0-9]/g, ''))}"><span class="ico">${icon('phone')}</span><span class="m"><b>Llamar a ${esc(d.nombre || d.tipo)}</b><small>${esc(d.tel)}${d.ref ? ' · ref. ' + esc(d.ref) : ''}</small></span></a>` : ''}`).join('')}</div>`
      : `<div class="empty"><h3>Sin documentos</h3><p>Añade la ITV, el seguro, el impuesto de circulación o la revisión del gas para que no se te pase ninguno.</p></div>`}
    <p class="hint" style="margin:14px 4px">${itvHint()}</p>`;
  el.querySelector('#add').onclick = () => docSheet({});
  el.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => docSheet(D.docs.find(x => x.id === b.dataset.d))));
}

