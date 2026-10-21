// Estadísticas: análisis de todo lo apuntado. Gastos es para apuntar y consultar; esto es para entender.
import { D } from '../db.js';
import { esc, icon, fKm, fDate, fEur, fEur0, fNum, fPpl, isSimple, uL100 } from '../ui.js';
import { ctx, tasksWithStatus, NIGHT, ZONA_ICO } from '../store.js';
import {
  isoToday, addMonths, kmBetween, consumption, fuelStats, tripCost, eur100Of,
  GRUPOS, monthsBetween, tripDone, costBreakdown, series, nightsIn, maintForecast, delta,
} from '../logic.js';

let periodo = 'anio', year = String(new Date().getFullYear());
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pl = (n, a, b) => `${fNum(n, 0)} ${n === 1 ? a : b}`;

/** Fecha más antigua con datos (gasto, km o viaje) */
function firstDate() {
  const f = [...D.expenses.map(e => e.fecha), ...D.odo.map(o => o.fecha), ...D.trips.map(t => t.inicio), ...D.services.map(s => s.fecha)].filter(Boolean).sort()[0];
  return f || isoToday();
}

function rango() {
  const t = isoToday();
  if (periodo === 'anio') {
    const cur = year === t.slice(0, 4);
    return { from: year + '-01-01', to: cur ? t : year + '-12-31', txt: cur ? `en ${year} (hasta hoy)` : `en ${year}` };
  }
  if (periodo === '12m') return { from: addMonths(t, -12), to: t, txt: 'en los últimos 12 meses' };
  return { from: firstDate(), to: t, txt: 'desde que empezaste a apuntar' };
}
/** Meses del periodo contando el actual entero (igual que la media mensual de Gastos) */
const monthsIn = (from, to) => Math.max(1, monthsBetween(from, to).length);

/* ---------- Gráficos (una sola escala; color = grupo, siempre con leyenda y tabla) ---------- */

/** Barras apiladas por grupo (mes o año) */
function stacked(rows, unit) {
  const max = Math.max(...rows.map(r => r.total), 1);
  const lab = r => (unit === 'm' ? MES[+r.k.slice(5, 7) - 1] : r.k);
  return `<div class="leg">${GRUPOS.map(([k, l]) => `<span><i class="sw-${k}"></i>${l}</span>`).join('')}</div>
    <div class="sbars" role="img" aria-label="Gasto por ${unit === 'm' ? 'mes' : 'año'} y grupo">${rows.map(r => `<div class="c" tabindex="0">
      <div class="tip"><b>${unit === 'm' ? MES[+r.k.slice(5, 7) - 1] + ' ' + r.k.slice(0, 4) : r.k}: ${fEur(r.total)}</b>${GRUPOS.filter(([k]) => r[k]).map(([k, l]) => `<span><i class="sw-${k}"></i>${l} ${fEur0(r[k])}</span>`).join('')}</div>
      <div class="col" style="height:${r.total ? Math.max(3, Math.round(r.total / max * 130)) : 0}px">${GRUPOS.filter(([k]) => r[k] > 0).map(([k]) => `<i class="sw-${k}" style="flex:${r[k]}"></i>`).join('')}</div>
      <span>${unit === 'm' && rows.length > 12 ? lab(r)[0] : lab(r)}</span></div>`).join('')}</div>`;
}
/** Barras de una serie (km) */
function simpleBars(rows, unit, val, fmt) {
  const max = Math.max(...rows.map(val), 1);
  return `<div class="bars" role="img">${rows.map(r => { const v = val(r), l = unit === 'm' ? MES[+r.k.slice(5, 7) - 1] : r.k;
    return `<div class="c" tabindex="0" title="${l}: ${fmt(v)}"><em>${v ? fmt(v) : ''}</em><i style="height:${v ? Math.max(3, Math.round(v / max * 110)) : 0}px"></i><span>${unit === 'm' && rows.length > 12 ? l[0] : l}</span></div>`; }).join('')}</div>`;
}
const table = (head, rows) => `<details class="tbl"><summary>Ver como tabla</summary><div class="tw"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
const card = (title, body, extra = '') => `<section class="card scard"><div class="sec"><h2>${title}${extra}</h2></div>${body}</section>`;
const dTxt = (d, inverse) => {
  if (d === null || !isFinite(d)) return '<span class="dl nd">—</span>';
  const up = d > 0.5, dn = d < -0.5, good = inverse ? dn : up;
  return `<span class="dl ${up || dn ? (good ? 'g' : 'b') : 'nd'}">${up ? '▲' : dn ? '▼' : '='} ${fNum(Math.abs(d), 0)} %</span>`;
};

/** Modo sencillo: el gasto por mes como lista legible (mes, importe y barra) en vez del gráfico apilado */
function monthList(rows, unit) {
  const max = Math.max(...rows.map(r => r.total), 1);
  return `<div class="hbars">${rows.slice().reverse().map(r => `<div class="hb"><b>${unit === 'm' ? MES[+r.k.slice(5, 7) - 1][0].toUpperCase() + MES[+r.k.slice(5, 7) - 1].slice(1) + ' ' + r.k.slice(0, 4) : r.k}</b><span>${fEur0(r.total)}${r.km ? ' · ' + fKm(r.km) : ''}</span><div class="t"><i style="width:${r.total / max * 100}%"></i></div></div>`).join('')}</div>`;
}

export function render(view) {
  const simple = isSimple();
  const years = [...new Set([String(new Date().getFullYear()), ...[...D.expenses.map(e => e.fecha), ...D.trips.map(t => t.inicio), ...D.odo.map(o => o.fecha)].filter(Boolean).map(f => f.slice(0, 4))])].sort().reverse();
  if (!years.includes(year)) year = years[0];
  const r = rango(), today = isoToday();
  const cb = costBreakdown(D.expenses, r.from, r.to);
  const km = kmBetween(D, r.from, r.to) || 0, months = monthsIn(r.from, r.to);
  const nights = nightsIn(D.trips, r.from, r.to, NIGHT);
  const tripsIn = D.trips.filter(t => t.inicio && t.inicio >= r.from && t.inicio <= r.to && tripDone(t, today));
  const e100all = eur100Of(D.expenses);

  // Serie temporal: por mes (hasta 24 meses) o por año
  const mk = monthsBetween(r.from, r.to), unit = mk.length > 24 ? 'y' : 'm';
  const keys = unit === 'm' ? mk : [...new Set(mk.map(m => m.slice(0, 4)))];
  const ser = series(D, keys, unit);

  // Combustible
  const fs = fuelStats(D.expenses, r.from, r.to), cons = consumption(D.expenses);
  const tram = cons.items.filter(x => x.fecha >= r.from && x.fecha <= r.to), K = tram.reduce((a, x) => a + x.kmTramo, 0);
  const l100 = K ? tram.reduce((a, x) => a + x.litros, 0) / K * 100 : null, e100 = K ? tram.reduce((a, x) => a + x.eur, 0) / K * 100 : null;

  // Mantenimiento
  const tw = tasksWithStatus(ctx()), cnt = s => tw.filter(x => x.s.state === s).length, withData = tw.length - cnt('nd');
  const byZona = {}; D.services.filter(s => s.fecha >= r.from && s.fecha <= r.to && +s.coste > 0).forEach(s => (byZona[s.zona || 'Otros'] = (byZona[s.zona || 'Otros'] || 0) + +s.coste));
  const zonas = Object.entries(byZona).sort((a, b) => b[1] - a[1]), maxZ = zonas.length ? zonas[0][1] : 1;
  const fc = maintForecast(tw, D.services, today, 12);

  // Comparativa con el año anterior (mismo tramo del año para que sea justa)
  let cmp = '';
  if (periodo === 'anio') {
    const py = String(+year - 1), pfrom = py + '-01-01', pto = py + r.to.slice(4);
    const pc = costBreakdown(D.expenses, pfrom, pto), pkm = kmBetween(D, pfrom, pto) || 0, pf = fuelStats(D.expenses, pfrom, pto), pn = nightsIn(D.trips, pfrom, pto, NIGHT);
    if (pc.n || pkm) {
      const rows = [
        ['Gasto total', fEur0(cb.total), fEur0(pc.total), dTxt(delta(cb.total, pc.total), true)],
        ['Kilómetros', fKm(km), fKm(pkm), dTxt(delta(km, pkm))],
        ['Coste por km', km ? fNum(cb.total / km, 2) + ' €' : '—', pkm ? fNum(pc.total / pkm, 2) + ' €' : '—', km && pkm ? dTxt(delta(cb.total / km, pc.total / pkm), true) : dTxt(null)],
        ['Gasóleo', fEur0(fs.eur), fEur0(pf.eur), dTxt(delta(fs.eur, pf.eur), true)],
        ['Precio medio del litro', fs.avgPrice ? fPpl(fs.avgPrice) + ' €' : '—', pf.avgPrice ? fPpl(pf.avgPrice) + ' €' : '—', dTxt(fs.avgPrice && pf.avgPrice ? delta(fs.avgPrice, pf.avgPrice) : null, true)],
        ['Noches fuera', fNum(nights, 0), fNum(pn, 0), dTxt(delta(nights, pn))],
      ];
      cmp = card(`${year} frente a ${py}`, `<p class="hint" style="margin:-4px 0 10px">${r.to.slice(5) === '12-31' ? 'Años completos.' : `Mismo tramo de cada año: del 1 de enero al ${fDate(r.to, { day: 'numeric', month: 'long' })}.`} En gastos, ▼ es bueno.</p>
        <div class="tw"><table class="cmp"><thead><tr><th></th><th>${year}</th><th>${py}</th><th>Cambio</th></tr></thead><tbody>${rows.map(x => `<tr><td>${x[0]}</td><td class="n">${x[1]}</td><td class="n mu">${x[2]}</td><td class="n">${x[3]}</td></tr>`).join('')}</tbody></table></div>`);
    }
  }

  // Viajes del periodo
  const tripRows = tripsIn.sort((a, b) => b.inicio.localeCompare(a.inicio)).map(t => {
    const tc = tripCost(t, D, e100all), n = t.fin && t.fin > t.inicio ? Math.round((new Date(t.fin) - new Date(t.inicio)) / 864e5) : (t.paradas || []).filter(p => NIGHT.has(p.tipo)).length;
    return { t, tc, n };
  });
  const pern = { area: 0, camping: 0, libre: 0 };
  tripsIn.forEach(t => (t.paradas || []).forEach(p => { if (p.tipo in pern) pern[p.tipo]++; }));
  const pernTot = pern.area + pern.camping + pern.libre;

  const g = cb.grupos, gTot = cb.total || 1, maxCat = cb.cats.length ? cb.cats[0][1] : 1;
  view.innerHTML = `<div class="vh"><div><h1>${simple ? 'Resumen' : 'Estadísticas'}</h1><p>${esc(r.txt[0].toUpperCase() + r.txt.slice(1))}</p></div></div>
    <div class="tools"><div class="seg" id="per">${[['anio', 'Año'], ['12m', '12 meses'], ['todo', 'Todo']].map(([k, l]) => `<button data-v="${k}" class="${periodo === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${periodo === 'anio' ? `<select id="yr" aria-label="Año">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}</div>
    ${!cb.n && !km && !tripsIn.length ? `<div class="empty"><h3>Sin datos ${esc(r.txt)}</h3><p>En cuanto apuntes repostajes, gastos o viajes verás aquí cuánto te cuesta tu autocaravana y cómo la usas.</p></div>` : `
    <div class="kpis k3">
      <div class="kpi"><span class="l">${icon('euro')}Coste total</span><span class="v">${fEur0(cb.total)}</span><span class="s">${pl(cb.n, 'apunte', 'apuntes')}</span></div>
      <div class="kpi"><span class="l">${icon('map')}Por kilómetro</span><span class="v">${km ? fNum(cb.total / km, 2) + ' €' : '—'}</span><span class="s">${km ? 'todo incluido' : 'faltan km'}</span></div>
      <div class="kpi"><span class="l">${icon('cal')}Al mes</span><span class="v">${fEur0(cb.total / months)}</span><span class="s">de media</span></div>
      <div class="kpi"><span class="l">${icon('gauge')}Kilómetros</span><span class="v">${fKm(km)}</span><span class="s">${km ? fNum(km / months, 0) + ' km/mes' : 'apunta km o repostajes'}</span></div>
      <div class="kpi"><span class="l">${icon('moon-bed')}Noches fuera</span><span class="v">${fNum(nights, 0)}</span><span class="s">${nights && cb.total ? fEur0(cb.total / nights) + ' por noche' : pl(tripsIn.length, 'viaje', 'viajes')}</span></div>
      <div class="kpi"><span class="l">${icon('map')}Viajes</span><span class="v">${fNum(tripsIn.length, 0)}</span><span class="s">${tripsIn.length ? fKm(tripRows.reduce((a, x) => a + x.tc.km, 0)) + ' en viajes' : 'hechos en el periodo'}</span></div>
    </div>

    <div class="grid2">
      ${card('En qué se va el dinero', `
        <div class="split" role="img" aria-label="Reparto del gasto por grupo">${GRUPOS.filter(([k]) => g[k] > 0).map(([k]) => `<i class="sw-${k}" style="flex:${g[k]}"></i>`).join('')}</div>
        <div class="legv">${GRUPOS.map(([k, l, cats]) => `<div><i class="sw-${k}"></i><span><b>${l}</b><small>${cats.join(', ')}</small></span><span class="n"><b>${fEur0(g[k])}</b><small>${cb.total ? Math.round(g[k] / gTot * 100) : 0} %</small></span></div>`).join('')}</div>
        <p class="hint" style="margin-top:10px">${g.fijos && cb.total ? `Lo fijo (seguro e impuestos) es el ${Math.round(g.fijos / gTot * 100)} %: lo pagas aunque no salgas. Cuantos más km hagas, menos pesa por km.` : 'Añade seguro e impuestos para ver el coste fijo.'}</p>
        <div class="hbars" style="margin-top:14px">${cb.cats.map(([c, v]) => `<div class="hb"><b>${esc(c)}</b><span>${fEur0(v)} · ${Math.round(v / gTot * 100)} %</span><div class="t"><i style="width:${v / maxCat * 100}%"></i></div></div>`).join('')}</div>`)}
      ${simple ? card(`Gasto por ${unit === 'm' ? 'mes' : 'año'}`, monthList(ser, unit)) : card(`Gasto por ${unit === 'm' ? 'mes' : 'año'}`, stacked(ser, unit) + table([unit === 'm' ? 'Mes' : 'Año', ...GRUPOS.map(x => x[1]), 'Total', 'Km'], ser.map(x => [unit === 'm' ? MES[+x.k.slice(5, 7) - 1] + ' ' + x.k.slice(0, 4) : x.k, ...GRUPOS.map(([k]) => fEur0(x[k])), `<b>${fEur0(x.total)}</b>`, fNum(x.km, 0)])))}
    </div>

    <div class="grid2">
      ${simple ? '' : card(`Kilómetros por ${unit === 'm' ? 'mes' : 'año'}`, simpleBars(ser, unit, x => x.km, v => fNum(v, 0)) + `<p class="hint" style="margin-top:8px">Calculado con todos los datos del cuentakilómetros: repostajes, mantenimientos, viajes y lecturas.</p>`)}
      ${card('Gasóleo', `<div class="mini">
          <div><small>Gastado</small><b>${fEur0(fs.eur)}</b></div><div><small>Litros</small><b>${fNum(fs.litros, 0)} L</b></div>
          <div><small>Cada 100 km</small><b>${e100 ? fEur(e100) : '—'}</b></div><div><small>Consumo</small><b>${l100 ? fNum(l100) + (simple ? ' L' : ' L/100') : '—'}</b>${simple && l100 ? '<small>litros cada 100 km</small>' : ''}</div>
          <div><small>Precio medio</small><b>${fs.avgPrice ? fPpl(fs.avgPrice) + ' €/L' : '—'}</b></div><div><small>Peso en el gasto</small><b>${cb.total ? Math.round(fs.eur / gTot * 100) + ' %' : '—'}</b></div>
        </div><a class="lnk" style="margin:12px 0 0" href="#/gastos/combustible">${icon('fuel')}Detalle de repostajes y precio del litro${icon('right')}</a>`)}
    </div>

    <div class="grid2">
      ${card('Mantenimiento', `<div class="mini">
          <div><small>Al día</small><b>${withData ? `${cnt('ok')} de ${withData}` : '—'}</b></div><div><small>Vencidas</small><b>${cnt('over')}</b></div>
          <div><small>Próximas</small><b>${cnt('soon')}</b></div><div><small>Sin datos</small><b>${cnt('nd')}</b></div>
        </div>${cnt('nd') ? `<p class="hint" style="margin-top:8px">${pl(cnt('nd'), 'tarea no cuenta', 'tareas no cuentan')}: falta saber cuándo se hizo por última vez. <a href="#/mant/completar">Completar</a></p>` : ''}
        ${zonas.length ? `<p class="sub">Gastado por zona ${esc(r.txt)}</p><div class="hbars">${zonas.map(([z, v]) => `<div class="hb"><b>${esc(z)}</b><span>${fEur0(v)}</span><div class="t"><i style="width:${v / maxZ * 100}%"></i></div></div>`).join('')}</div>` : `<p class="hint" style="margin-top:12px">Sin mantenimientos con coste ${esc(r.txt)}.</p>`}
        <p class="sub">Previsión: próximos 12 meses</p>
        ${fc.items.length ? `<div class="list">${fc.items.slice(0, 6).map(({ t, s, coste }) => `<a class="row" href="#/mant"><span class="ico">${icon(ZONA_ICO[t.zona] || 'wrench')}</span><span class="m"><b>${esc(t.nombre)}</b><small>${s.state === 'over' ? 'Vencida' : 'Hacia ' + fDate(s.when, { month: 'short', year: 'numeric' })}</small></span><span class="r">${coste ? `<b>≈ ${fEur0(coste)}</b><small>la última vez</small>` : '<small>sin coste previo</small>'}</span></a>`).join('')}</div>
          <p class="hint" style="margin-top:8px">${fc.items.length > 6 ? `Y ${fc.items.length - 6} más. ` : ''}${fc.known ? `Con lo que pagaste la última vez: <b>≈ ${fEur0(fc.known)}</b>` : 'Aún no hay costes previos para estimar'}${fc.unknown ? `, más ${pl(fc.unknown, 'tarea', 'tareas')} sin coste conocido` : ''}. Es una referencia, no un presupuesto.</p>`
          : '<p class="hint">Nada vence en los próximos 12 meses.</p>'}`)}
      ${card('Viajes', tripRows.length ? `<div class="tw"><table><thead><tr><th>Viaje</th><th>Km</th><th>Noches</th><th>Coste ≈</th><th>€/noche</th></tr></thead><tbody>
          ${tripRows.map(({ t, tc, n }) => `<tr><td><a href="#/viaje/${t.id}">${esc(t.nombre)}</a><small>${fDate(t.inicio, { month: 'short', year: 'numeric' })}</small></td><td class="n">${fNum(tc.km, 0)}${tc.kmReal ? '' : '*'}</td><td class="n">${n || '—'}</td><td class="n">${tc.total ? fEur0(tc.total) : '—'}</td><td class="n">${n && tc.total ? fEur0(tc.total / n) : '—'}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="hint" style="margin-top:8px">Coste ≈ = gastos del viaje + gasóleo consumido según tus km y tu coste cada 100 km.${tripRows.some(x => !x.tc.kmReal) ? ' * km de la ruta planificada (no apuntaste los reales).' : ''}</p>
          ${pernTot ? `<p class="sub">Dónde duermes (pernoctas marcadas en las paradas)</p><div class="hbars">${[['area', 'Área AC'], ['camping', 'Camping'], ['libre', 'Libre']].map(([k, l]) => `<div class="hb"><b>${l}</b><span>${pern[k]} · ${Math.round(pern[k] / pernTot * 100)} %</span><div class="t"><i style="width:${pern[k] / Math.max(pern.area, pern.camping, pern.libre) * 100}%"></i></div></div>`).join('')}</div>` : ''}`
        : `<p class="hint">No hay viajes terminados ${esc(r.txt)}.</p>`)}
    </div>
    ${cmp}`}
    <div class="pb"></div>`;

  view.querySelector('#per').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { periodo = b.dataset.v; render(view); } };
  const yr = view.querySelector('#yr'); if (yr) yr.onchange = e => { year = e.target.value; render(view); };
}
