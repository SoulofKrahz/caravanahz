// Combustible: cuánto gastas en gasóleo, no solo cuántos litros. Pestaña dentro de Gastos.
import { D } from '../db.js';
import { esc, icon, fKm, fDate, fEur, fEur0, fNum, fPpl, uL100, isSimple } from '../ui.js';
import { vehicle } from '../store.js';
import { consumption, fuelStats, kmBetween, isoToday, addMonths } from '../logic.js';
import { expenseSheet, askDeleteExpense } from '../forms.js';
import { refresh } from '../router.js';

let periodo = 'anio';
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function rango() {
  const t = isoToday(), y = t.slice(0, 4);
  if (periodo === 'anio') return { from: y + '-01-01', to: t, txt: 'este año' };
  if (periodo === '12m') return { from: addMonths(t, -12), to: t, txt: 'últimos 12 meses' };
  return { from: '', to: t, txt: 'desde el principio' };
}

/** Gráfico de línea sencillo (una serie) para el precio del litro: eje Y ajustado al rango real */
function priceChart(pts) {
  if (pts.length < 2) return '<p class="hint">Con dos repostajes o más verás aquí cómo cambia el precio.</p>';
  const W = 320, H = 130, pl = 42, pr = 8, pt = 10, pb = 22;
  const vs = pts.map(p => p.ppl), mn = Math.min(...vs), mx = Math.max(...vs), pad = Math.max(0.01, (mx - mn) * 0.15);
  const lo = mn - pad, hi = mx + pad;
  const X = i => pl + (pts.length === 1 ? 0 : i / (pts.length - 1)) * (W - pl - pr), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.ppl).toFixed(1)).join(' ');
  const grid = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  return `<svg class="lc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio del litro en cada repostaje, de ${fPpl(mn)} a ${fPpl(mx)} €/L">
    ${grid.map(g => `<line x1="${pl}" x2="${W - pr}" y1="${Y(g)}" y2="${Y(g)}" class="gl"/><text x="${pl - 6}" y="${Y(g) + 3.5}" text-anchor="end" class="ax">${fNum(g, 2)}</text>`).join('')}
    <path d="${d}" class="ln"/>
    ${pts.map((p, i) => `<g class="pt"><circle cx="${X(i)}" cy="${Y(p.ppl)}" r="10" class="hit"><title>${fDate(p.fecha)} · ${fPpl(p.ppl)} €/L${p.concepto ? ' · ' + esc(p.concepto) : ''}</title></circle><circle cx="${X(i)}" cy="${Y(p.ppl)}" r="3.5" class="dot"/></g>`).join('')}
    <text x="${pl}" y="${H - 6}" class="ax">${fDate(pts[0].fecha, { month: 'short', year: '2-digit' })}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" class="ax">${fDate(pts[pts.length - 1].fecha, { month: 'short', year: '2-digit' })}</text>
  </svg>`;
}

export function renderFuel(el) {
  const r = rango(), st = fuelStats(D.expenses, r.from, r.to);
  const allC = consumption(D.expenses), c = { ...allC, items: allC.items.filter(x => x.fecha >= r.from && x.fecha <= r.to) };
  const K = c.items.reduce((s, x) => s + x.kmTramo, 0);
  const l100 = K ? c.items.reduce((s, x) => s + x.litros, 0) / K * 100 : null, e100 = K ? c.items.reduce((s, x) => s + x.eur, 0) / K * 100 : null;
  const km = kmBetween(D, r.from, r.to), dep = +vehicle().deposito || 0;
  const eurKm = km ? st.eur / km : null;
  const avgAll = allC.avg, autonomia = dep && avgAll ? dep / avgAll * 100 : null;

  // Gasto por mes (año / 12 meses) o por año (todo)
  let bars = [];
  const fuelE = D.expenses.filter(e => e.cat === 'Combustible' && e.fecha >= r.from && e.fecha <= r.to);
  if (periodo === 'todo') {
    const by = {}; fuelE.forEach(e => (by[e.fecha.slice(0, 4)] = (by[e.fecha.slice(0, 4)] || 0) + (+e.importe || 0)));
    bars = Object.keys(by).sort().map(k => [k, by[k], k]);
  } else {
    const start = periodo === 'anio' ? r.from : r.to.slice(0, 7) + '-01', n = periodo === 'anio' ? +r.to.slice(5, 7) : 12;
    for (let i = 0; i < n; i++) {
      const m = periodo === 'anio' ? addMonths(start, i) : addMonths(start, i - 11), k = m.slice(0, 7);
      bars.push([k, fuelE.filter(e => e.fecha.startsWith(k)).reduce((s, e) => s + (+e.importe || 0), 0), MES[+k.slice(5, 7) - 1]]);
    }
  }
  const maxB = Math.max(...bars.map(b => b[1]), 1);
  const tram = c.items.slice(-12), maxT = Math.max(...tram.map(x => x.eur100), 1);
  const list = fuelE.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (+b.km || 0) - (+a.km || 0));
  const tramoDe = new Map(allC.items.map(x => [x.fecha + '|' + x.km, x]));

  el.innerHTML = `<div class="tools"><div class="seg" id="per">${[['anio', 'Este año'], ['12m', '12 meses'], ['todo', 'Todo']].map(([k, l]) => `<button data-v="${k}" class="${periodo === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn" id="add">${icon('fuel')}Repostaje</button></div>
    <div class="kpis">
      <div class="kpi"><span class="l">${icon('euro')}Gasto en gasóleo</span><span class="v">${fEur0(st.eur)}</span><span class="s">${st.n} ${st.n === 1 ? 'repostaje' : 'repostajes'} ${r.txt}</span></div>
      <div class="kpi"><span class="l">${icon('map')}Coste por kilómetro</span><span class="v">${eurKm ? fPpl(eurKm) + ' €/km' : '—'}</span><span class="s">${km ? 'en ' + fKm(km) + ' recorridos' : 'Faltan km registrados'}</span></div>
      <div class="kpi"><span class="l">${icon('fuel')}Cada 100 km</span><span class="v">${e100 ? fEur(e100) : '—'}</span><span class="s">${l100 ? fNum(l100) + uL100() : 'Necesito dos llenos con km'}</span></div>
      <div class="kpi"><span class="l">${icon('gauge')}Precio medio</span><span class="v">${st.avgPrice ? fPpl(st.avgPrice) + ' €' : '—'}</span><span class="s">${st.min && st.max && st.min !== st.max ? `por litro · de ${fPpl(st.min.ppl)} a ${fPpl(st.max.ppl)}` : 'por litro'}</span></div>
      <div class="kpi"><span class="l">${icon('fuel')}Litros</span><span class="v">${fNum(st.litros, 0)} L</span><span class="s">${r.txt}</span></div>
      <div class="kpi"><span class="l">${icon('gps')}Autonomía</span><span class="v">${autonomia ? '≈ ' + fKm(Math.round(autonomia / 10) * 10) : '—'}</span><span class="s">${autonomia ? `con ${dep} L y tu consumo` : dep ? 'falta tu consumo medio' : 'indica el depósito en Ajustes'}</span></div>
    </div>
    ${st.n ? `<div class="grid2" style="margin-bottom:18px">
      <div class="card"><div class="sec"><h2>Gasto en gasóleo por ${periodo === 'todo' ? 'año' : 'mes'}</h2></div>
        <div class="bars" role="img" aria-label="Gasto en gasóleo">${bars.map(([k, v, l]) => `<div class="c" tabindex="0" title="${l}: ${fEur(v)}"><em>${fEur0(v)}</em><i style="height:${v ? Math.max(3, Math.round(v / maxB * 110)) : 0}px"></i><span>${periodo === 'todo' ? l : l[0].toUpperCase()}</span></div>`).join('')}</div></div>
      <div class="card"><div class="sec"><h2>Precio del litro (€)</h2></div>${priceChart(st.prices)}
        ${st.min && st.max && st.min !== st.max ? `<p class="hint" style="margin-top:8px">Más barato: ${fPpl(st.min.ppl)} € (${fDate(st.min.fecha)}${st.min.concepto ? ', ' + esc(st.min.concepto) : ''}) · más caro: ${fPpl(st.max.ppl)} € (${fDate(st.max.fecha)}${st.max.concepto ? ', ' + esc(st.max.concepto) : ''})</p>` : ''}</div>
    </div>` : ''}
    ${tram.length ? `<div class="card" style="margin-bottom:18px"><div class="sec"><h2>${isSimple() ? 'Lo que te cuestan 100 km, entre llenado y llenado' : 'Coste real cada 100 km, por tramo de lleno a lleno'}</h2></div>
      <div class="bars" role="img" aria-label="Euros cada 100 km por tramo">${tram.map(x => `<div class="c" tabindex="0" title="${fDate(x.fecha)}: ${fEur(x.eur100)} cada 100 km · ${fNum(x.l100)} L/100 · ${fKm(x.kmTramo)}"><em>${fNum(x.eur100, 1)}</em><i style="height:${Math.max(3, Math.round(x.eur100 / maxT * 110))}px"></i><span>${fDate(x.fecha, { day: 'numeric', month: 'numeric' })}</span></div>`).join('')}</div></div>` : ''}
    ${list.length ? `<div class="gh"><span>Repostajes ${r.txt}</span><span>${fEur(st.eur)}</span></div><div class="list">${list.map(e => {
      const t = tramoDe.get(e.fecha + '|' + (+e.km)), ppl = +e.litros > 0 ? +e.importe / +e.litros : null;
      const sub = [fDate(e.fecha, { day: 'numeric', month: 'short', year: 'numeric' }), e.litros ? fNum(e.litros, 2) + ' L' : '', ppl ? fPpl(ppl) + ' €/L' : '', e.km ? fKm(e.km) : 'sin km', e.lleno ? 'lleno' : 'parcial'].filter(Boolean).join(' · ');
      return `<div class="erow"><button class="row" data-e="${e.id}"><span class="ico">${icon('fuel')}</span><span class="m"><b>${esc(e.concepto || 'Repostaje')}</b><small class="wrap">${esc(sub)}</small>${t ? `<small class="tram wrap">Tramo: ${fKm(t.kmTramo)} · ${fNum(t.l100)} L/100 · ${fEur(t.eur100)}/100 km</small>` : ''}</span><span class="r"><b>${fEur(e.importe)}</b></span></button><button class="ib" data-dx="${e.id}" aria-label="Borrar el gasto ${esc(e.concepto || 'repostaje')}" title="Borrar">${icon('trash')}</button></div>`;
    }).join('')}</div>`
      : `<div class="empty"><h3>Sin repostajes ${r.txt}</h3><p>Apunta cada repostaje con los litros, el precio y los km. Con dos llenos te digo cuánto te cuesta cada 100 km.</p><button class="btn" id="add2">${icon('fuel')}Registrar repostaje</button></div>`}
    ${c.discarded ? `<p class="fm warn" style="margin-top:12px">He descartado ${c.discarded} ${c.discarded === 1 ? 'tramo' : 'tramos'} con un consumo imposible (menos de 3 o más de 40 L/100 km): revisa los km o los litros de esos repostajes.</p>` : ''}
    <p class="hint" style="margin:14px 4px">«Cada 100 km» es dinero real: suma lo pagado entre dos llenos (incluidos los repostajes parciales) y lo divide entre los km del tramo. «Coste por kilómetro» divide todo lo gastado en gasóleo entre los km recorridos en el periodo. Si olvidas apuntar un repostaje, ese tramo sale más barato de lo que fue.</p>`;

  el.querySelector('#per').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { periodo = b.dataset.v; renderFuel(el); } };
  el.querySelector('#add').onclick = () => expenseSheet({}, { cat: 'Combustible' });
  const a2 = el.querySelector('#add2'); if (a2) a2.onclick = () => expenseSheet({}, { cat: 'Combustible' });
  el.querySelectorAll('[data-e]').forEach(b => (b.onclick = () => expenseSheet(D.expenses.find(x => x.id === b.dataset.e))));
  el.querySelectorAll('[data-dx]').forEach(b => (b.onclick = () => askDeleteExpense(D.expenses.find(x => x.id === b.dataset.dx), refresh)));
}
