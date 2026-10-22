// Lógica pura (sin DOM): vencimientos, kilómetros, consumo y exportaciones.
// Se puede probar en Node: no depende del navegador.

const DAY = 864e5;

export const isoToday = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const parseISO = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / DAY);

/** Suma meses a una fecha ISO sin desbordar (31 ene + 1 mes = 28/29 feb) */
export function addMonths(iso, months) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoToday(d);
}
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoToday(d); }

/** Todos los puntos (fecha, km) conocidos, de cualquier registro */
export function kmPoints(D) {
  const p = [];
  const add = (fecha, km, id, aprox) => { km = +km; if (fecha && km > 0) p.push({ fecha, km, id, aprox: !!aprox }); };
  D.odo.forEach(o => add(o.fecha, o.km, o.id, o.aprox));
  D.expenses.forEach(e => add(e.fecha, e.km, e.id));
  D.services.forEach(s => add(s.fecha, s.km, s.id));
  D.trips.forEach(t => { add(t.inicio, t.kmIni, t.id); add(t.fin || t.inicio, t.kmFin, t.id); });
  return p.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.km - b.km);
}

/**
 * El cuentakilómetros no puede bajar con el tiempo. Devuelve el dato que lo contradice, o null.
 * ignoreId: el registro que se está editando (su valor anterior no cuenta).
 */
export function kmConflict(D, fecha, km, ignoreId) {
  km = +km; if (!km || !fecha) return null;
  // Los km aproximados que pusiste al configurar no bloquean apuntar después repostajes antiguos con los km exactos
  const p = kmPoints(D).filter(x => x.id !== ignoreId && !(x.aprox && x.fecha > fecha));
  return p.find(x => x.fecha <= fecha && x.km > km) || p.find(x => x.fecha > fecha && x.km < km) || null;
}

/**
 * ¿Es creíble este dato del cuentakilómetros? Comprueba que no baje y que no salte más de
 * 1.500 km por día respecto al dato anterior o posterior más cercano (típico error: un cero de más).
 * Devuelve { tipo: 'baja'|'salto', ref, dias } o null.
 */
export function kmCheck(D, fecha, km, ignoreId) {
  km = +km; if (!km || !fecha) return null;
  const c = kmConflict(D, fecha, km, ignoreId);
  if (c) return { tipo: 'baja', ref: c };
  // Para los saltos imposibles sí cuentan los km aproximados de la configuración: 1.000 km hace una semana
  // con una autocaravana que hoy marca 145.000 no es un dato del cuentakilómetros
  const p = kmPoints(D).filter(x => x.id !== ignoreId);
  const prev = p.filter(x => x.fecha <= fecha).pop(), next = p.find(x => x.fecha > fecha);
  for (const r of [prev, next].filter(Boolean)) {
    const dias = Math.max(1, Math.abs(daysBetween(r.fecha, fecha)));
    if (Math.abs(km - r.km) / dias > 1500) return { tipo: 'salto', ref: r, dias };
  }
  return null;
}

/**
 * Curva del cuentakilómetros: un punto por día con la lectura más baja (lo) y la más alta (hi) de ese día,
 * nunca decreciente. Guardar las dos importa: si sales y vuelves el mismo día (o configuras la autocaravana
 * y haces un viaje ese día), los km del día son hi − lo; con una sola lectura por día salían 0.
 */
export function odoCurve(D) {
  const day = {};
  kmPoints(D).forEach(p => { const d = day[p.fecha] || (day[p.fecha] = { lo: Infinity, hi: 0 }); d.lo = Math.min(d.lo, p.km); d.hi = Math.max(d.hi, p.km); });
  let mx = 0;
  return Object.keys(day).sort().map(f => { const lo = Math.max(mx, day[f].lo), hi = Math.max(lo, day[f].hi); mx = hi; return { fecha: f, lo, hi }; });
}

/**
 * Lectura al EMPEZAR el día `iso`, interpolando entre los datos conocidos.
 * Entre dos lecturas, los km se reparten por días (si repostas el 10 de agosto y el 18 de septiembre,
 * una parte cae en agosto y otra en septiembre). Fuera del rango de datos no se inventa nada.
 */
export function odoStart(pts, iso) {
  if (!pts.length) return null;
  let i = 0; while (i < pts.length && pts[i].fecha < iso) i++;
  if (i < pts.length && pts[i].fecha === iso) return pts[i].lo;
  if (i === 0) return pts[0].lo;
  if (i === pts.length) return pts[i - 1].hi;
  const a = pts[i - 1], b = pts[i], aEnd = addDays(a.fecha, 1);
  const span = daysBetween(aEnd, b.fecha);
  return span > 0 ? a.hi + (b.lo - a.hi) * daysBetween(aEnd, iso) / span : a.hi;
}
/** Lectura al terminar el día `iso` */
export const odoAt = (D, iso, pts = null) => odoStart(pts || odoCurve(D), addDays(iso, 1));

/** Km recorridos entre dos fechas (incluidas). null si no hay datos que cubran el periodo. */
export function kmBetween(D, from = '', to = '9999-12-31') {
  const pts = odoCurve(D); if (!pts.length) return null;
  if (to < pts[0].fecha || (from && from > pts[pts.length - 1].fecha)) return null;
  const start = from ? odoStart(pts, from) : pts[0].lo, end = to >= '9999' ? pts[pts.length - 1].hi : odoStart(pts, addDays(to, 1));
  return Math.max(0, Math.round(end - start));
}

/** Un viaje está hecho cuando ya has apuntado los km de vuelta o su fecha de vuelta ya pasó */
/**
 * ¿Viaje terminado? Con km de vuelta, sí; con fecha de vuelta, cuando ya ha pasado.
 * Sin fecha de vuelta, el viaje sigue abierto (estás de viaje) hasta que apuntes que has vuelto:
 * se puede salir sin saber cuándo se vuelve.
 */
export const tripDone = (t, today = isoToday()) => !!t.kmFin || !!t.cerrado || (!!t.fin && t.fin < today);
/** Viaje en marcha sin fecha de vuelta */
export const tripOpen = (t, today = isoToday()) => !!t.inicio && t.inicio <= today && !t.fin && !t.kmFin && !t.cerrado;
/** Viaje en el que cae una fecha (para asignarle un gasto): la salida ya ha llegado y la vuelta no ha pasado (o no tiene) */
export function tripOn(trips, fecha, today = isoToday()) {
  return trips.filter(t => t.inicio && t.inicio <= fecha && (t.fin ? fecha <= t.fin : !t.kmFin && !t.cerrado && fecha <= today))
    // El mismo día en que uno termina y otro empieza, gana el que sigue en marcha
    .sort((a, b) => tripDone(a, today) - tripDone(b, today) || b.inicio.localeCompare(a.inicio))[0] || null;
}

/** Kilometraje actual: el mayor de todos los registrados */
export function currentKm(D) {
  return kmPoints(D).reduce((m, x) => Math.max(m, x.km), +(D.kv.vehicle && D.kv.vehicle.km) || 0);
}

/**
 * Ritmo de uso en km/día, con los datos de los últimos 12 meses.
 * Necesita al menos 30 días entre el primer y el último dato; si no, devuelve null (no se inventa).
 */
export function kmRate(D, today = isoToday()) {
  const from = addMonths(today, -12);
  const p = kmPoints(D).filter(x => x.fecha >= from && x.fecha <= today);
  if (p.length < 2) return null;
  const a = p[0], b = p.reduce((m, x) => (x.km > m.km ? x : m), p[0]);
  const days = daysBetween(a.fecha, b.fecha);
  if (days < 30 || b.km <= a.km) return null;
  return (b.km - a.km) / days;
}

/**
 * Estado de una tarea de mantenimiento.
 * Vence por fecha (intervalo en meses) y/o por km; manda la que llegue antes.
 * state: 'nd' (sin último registro) | 'over' (vencida) | 'soon' (próxima) | 'ok'
 */
export function taskStatus(t, { km = 0, rate = null, today = isoToday(), warnDays = 30, warnKm = 1000 } = {}) {
  const im = +t.intMeses || 0, ik = +t.intKm || 0;
  const r = { state: 'nd', dueDate: null, dueKm: null, daysLeft: null, kmLeft: null, pct: 0, projDate: null, by: null };
  if (!im && !ik) return r;
  const hasDate = !!t.ultFecha, hasKm = t.ultKm !== undefined && t.ultKm !== null && t.ultKm !== '';
  if (!hasDate && !hasKm) return r;

  let pDate = 0, pKm = 0;
  if (im && hasDate) {
    r.dueDate = addMonths(t.ultFecha, im);
    r.daysLeft = daysBetween(today, r.dueDate);
    const total = daysBetween(t.ultFecha, r.dueDate) || 1;
    pDate = 1 - r.daysLeft / total;
  }
  if (ik && hasKm) {
    r.dueKm = +t.ultKm + ik;
    r.kmLeft = r.dueKm - km;
    pKm = 1 - r.kmLeft / ik;
    if (rate && rate > 0) r.projDate = addDays(today, Math.max(0, Math.round(r.kmLeft / rate)));
  }
  r.pct = Math.max(0, Math.min(1, Math.max(pDate, pKm)));
  r.by = pKm > pDate ? 'km' : 'fecha';

  const over = (r.daysLeft !== null && r.daysLeft < 0) || (r.kmLeft !== null && r.kmLeft < 0);
  const soon = (r.daysLeft !== null && r.daysLeft <= warnDays) || (r.kmLeft !== null && r.kmLeft <= warnKm) ||
    (r.projDate && daysBetween(today, r.projDate) <= warnDays);
  r.state = over ? 'over' : soon ? 'soon' : 'ok';
  // La fecha efectiva de vencimiento: la más cercana entre la de calendario y la proyectada por km
  r.when = [r.dueDate, r.projDate].filter(Boolean).sort()[0] || null;
  return r;
}

export function docStatus(d, { today = isoToday(), warnDays = 30 } = {}) {
  if (!d.vence) return { state: 'nd', daysLeft: null };
  const daysLeft = daysBetween(today, d.vence);
  const w = d.avisoDias !== undefined && d.avisoDias !== '' ? +d.avisoDias : warnDays;
  return { state: daysLeft < 0 ? 'over' : daysLeft <= w ? 'soon' : 'ok', daysLeft };
}

export const RANK = { over: 0, soon: 1, nd: 2, ok: 3 };

/**
 * Consumo y coste por el método «de lleno a lleno».
 * Entre dos llenos con km, se suman los litros y los euros de todos los repostajes intermedios
 * (también los parciales sin km) y se dividen entre los km recorridos.
 * Cada tramo: { fecha, km, kmTramo, litros, eur, l100, eur100 }.
 */
export function consumption(expenses) {
  const f = expenses.filter(e => e.cat === 'Combustible' && +e.litros > 0)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (+a.km || 0) - (+b.km || 0) || (a.upd || 0) - (b.upd || 0));
  const out = [];
  let last = null, accL = 0, accE = 0;
  for (const e of f) {
    if (last) { accL += +e.litros; accE += +e.importe || 0; }
    if (e.lleno && +e.km > 0) {
      if (last && +e.km > +last.km) {
        const kmT = +e.km - +last.km;
        out.push({ fecha: e.fecha, km: +e.km, kmTramo: kmT, litros: accL, eur: accE, l100: accL / kmT * 100, eur100: accE / kmT * 100 });
      }
      last = e; accL = 0; accE = 0;
    }
  }
  const valid = out.filter(x => x.l100 > 3 && x.l100 < 40); // descarta datos imposibles por errores de tecleo
  const K = valid.reduce((s, x) => s + x.kmTramo, 0);
  return {
    avg: K ? valid.reduce((s, x) => s + x.litros, 0) / K * 100 : null,
    eur100: K ? valid.reduce((s, x) => s + x.eur, 0) / K * 100 : null,
    n: valid.length, items: valid, discarded: out.length - valid.length,
  };
}

/**
 * Coste de un viaje.
 * Lo que pagas en la gasolinera durante el viaje NO es lo que gasta el viaje: sales con el depósito
 * lleno y vuelves con lo que quede. El gasóleo del viaje se calcula con los km (reales si los hay,
 * si no los de la ruta) y tu coste real cada 100 km; lo pagado en ruta se muestra aparte.
 */
export function tripCost(t, D, eur100 = null) {
  const kmReal = t.kmIni && t.kmFin ? t.kmFin - t.kmIni : 0, km = kmReal || +t.kmRuta || 0;
  const ex = D.expenses.filter(e => e.viajeId === t.id);
  const fuelPaid = ex.filter(e => e.cat === 'Combustible').reduce((a, e) => a + (+e.importe || 0), 0);
  const other = ex.filter(e => e.cat !== 'Combustible').reduce((a, e) => a + (+e.importe || 0), 0);
  const fuelUsed = eur100 && km ? km * eur100 / 100 : null;
  const fuel = fuelUsed ?? fuelPaid; // sin consumo conocido, lo pagado es la mejor aproximación
  const total = other + fuel;
  return { km, kmReal: !!kmReal, fuelUsed, fuelPaid, other, total, perKm: km && total ? total / km : null, estimated: fuelUsed !== null };
}

/** € reales cada 100 km de tu historial; si aún no hay dos llenos, consumo medio × último precio */
export function eur100Of(expenses) {
  const c = consumption(expenses);
  if (c.eur100) return c.eur100;
  const p = lastFuelPrice(expenses);
  return c.avg && p ? c.avg * p : null;
}

/** Resumen de repostajes en un periodo [from, to] (fechas ISO, ambas opcionales) */
export function fuelStats(expenses, from = '', to = '9999') {
  const f = expenses.filter(e => e.cat === 'Combustible' && (e.fecha || '') >= from && (e.fecha || '') <= to);
  const withL = f.filter(e => +e.litros > 0 && +e.importe > 0);
  const eur = f.reduce((s, e) => s + (+e.importe || 0), 0);
  const litros = withL.reduce((s, e) => s + +e.litros, 0), eurL = withL.reduce((s, e) => s + +e.importe, 0);
  const prices = withL.map(e => ({ fecha: e.fecha, ppl: +e.importe / +e.litros, id: e.id, concepto: e.concepto })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const byPrice = prices.slice().sort((a, b) => a.ppl - b.ppl);
  return { n: f.length, eur, litros, avgPrice: litros ? eurL / litros : null, prices, min: byPrice[0] || null, max: byPrice[byPrice.length - 1] || null };
}

/** Último precio por litro conocido */
export function lastFuelPrice(expenses) {
  const f = expenses.filter(e => e.cat === 'Combustible' && +e.litros > 0 && +e.importe > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return f.length ? +f[0].importe / +f[0].litros : null;
}

/* ---------- Exportaciones ---------- */

const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };

/** Calendario .ics con eventos de día completo y alarma unos días antes */
export function buildICS(events, stamp = new Date()) {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Krahz//Caravanahz//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Caravanahz'];
  events.forEach(e => {
    const d = e.date.replace(/-/g, ''), d2 = addDays(e.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@caravanahz', 'DTSTAMP:' + dt, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2,
      fold('SUMMARY:' + icsEsc(e.title)), fold('DESCRIPTION:' + icsEsc(e.desc)),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.title), 'TRIGGER:-P' + (e.alarmDays || 7) + 'D', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function buildCSV(rows) {
  const c = v => { v = v === undefined || v === null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '\uFEFF' + rows.map(r => r.map(c).join(';')).join('\r\n');
}

export const haversine = (a, b) => {
  const R = 6371, t = x => x * Math.PI / 180, dLat = t(b.lat - a.lat), dLon = t(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* ---------- Estadísticas ---------- */

/** Grupos de coste: lo fijo (pagas aunque no salgas), el uso, el mantenimiento y el equipo */
export const GRUPOS = [
  ['fijos', 'Fijos', ['Seguro', 'Impuestos y tasas']],
  ['uso', 'Uso', ['Combustible', 'Peajes', 'Área / camping', 'Ferry']],
  ['mant', 'Mantenimiento', ['Mantenimiento']],
  ['equipo', 'Equipamiento y otros', ['Equipamiento', 'Otros']],
];
export const grupoDe = cat => (GRUPOS.find(g => g[2].includes(cat)) || GRUPOS[3])[0];

/** Lista de meses 'YYYY-MM' entre dos fechas ISO (incluidos) */
export function monthsBetween(from, to) {
  const out = []; let y = +from.slice(0, 4), m = +from.slice(5, 7);
  const ey = +to.slice(0, 4), em = +to.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) { out.push(y + '-' + String(m).padStart(2, '0')); if (++m > 12) { m = 1; y++; } if (out.length > 600) break; }
  return out;
}

/** Gasto por grupo y por categoría en [from, to] */
export function costBreakdown(expenses, from, to) {
  const g = { fijos: 0, uso: 0, mant: 0, equipo: 0 }, cat = {};
  let total = 0, n = 0;
  expenses.forEach(e => {
    if (!e.fecha || e.fecha < from || e.fecha > to) return;
    const v = +e.importe || 0; total += v; n++;
    g[grupoDe(e.cat)] += v; cat[e.cat] = (cat[e.cat] || 0) + v;
  });
  return { total, n, grupos: g, cats: Object.entries(cat).sort((a, b) => b[1] - a[1]) };
}

/** Serie por periodo (mes 'YYYY-MM' o año 'YYYY'): gasto por grupo y km recorridos */
export function series(D, keys, unit = 'm') {
  return keys.map(k => {
    const from = unit === 'm' ? k + '-01' : k + '-01-01';
    const to = unit === 'm' ? isoToday(new Date(+k.slice(0, 4), +k.slice(5, 7), 0)) : k + '-12-31';
    const c = costBreakdown(D.expenses, from, to);
    return { k, ...c.grupos, total: c.total, km: kmBetween(D, from, to) || 0 };
  });
}

/** Noches fuera en [from, to]: por fechas del viaje, o por pernoctas marcadas si no hay vuelta */
export function nightsIn(trips, from, to, nightTypes, today = isoToday()) {
  let n = 0;
  trips.forEach(t => {
    if (!t.inicio || t.inicio > to) return;
    // Viaje abierto (sin fecha de vuelta): cuentan las noches pasadas hasta hoy
    const end = t.fin || (tripOpen(t, today) ? today : '');
    if (end && end > t.inicio) {
      const a = t.inicio < from ? from : t.inicio, b = end > to ? to : end;
      if (b > a) n += daysBetween(a, b);
    } else if (t.inicio >= from) n += (t.paradas || []).filter(p => nightTypes.has(p.tipo)).length;
  });
  return n;
}

/**
 * Previsión de mantenimiento: tareas que vencen en los próximos `months` meses (o ya vencidas),
 * con el último coste conocido de cada una. Las que nunca se han pagado cuentan como «coste desconocido».
 */
export function maintForecast(tasksWithStatus, services, today, months = 12) {
  const lim = addMonths(today, months);
  const items = tasksWithStatus.filter(({ s }) => s.state === 'over' || s.state === 'soon' || (s.when && s.when <= lim)).map(({ t, s }) => {
    const h = services.filter(x => x.tareaId === t.id && +x.coste > 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { t, s, coste: h.length ? +h[0].coste : null };
  });
  return { items, known: items.reduce((a, x) => a + (x.coste || 0), 0), unknown: items.filter(x => x.coste === null).length };
}

/** Variación porcentual con signo, o null si no se puede calcular */
export const delta = (a, b) => (b ? (a - b) / b * 100 : null);
