// Viajes: lista y editor con mapa. Evolución de Rutahz, sin límite a Mallorca y con pernoctas.
import { D, put, del, uid } from '../db.js';
import { $, esc, icon, fKm, fDate, fDur, fEur, fNum, fPpl, rel, sheet, form, toast, undo, ask } from '../ui.js';
import { onSubmit, normKey, normText, R } from '../valid.js';
import { STOP_TIPOS, NIGHT, prefs, vehicle } from '../store.js';
import { isoToday, haversine, consumption, lastFuelPrice, daysBetween, addMonths, currentKm, tripCost, eur100Of, tripDone, tripOpen } from '../logic.js';
import { expenseSheet, kmMsg } from '../forms.js';
import { go, refresh } from '../router.js';

/* ---------- Lista ---------- */
export function render(view, params) {
  const today = isoToday();
  const all = D.trips.slice().sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  const up = all.filter(t => !tripDone(t, today)).reverse(), past = all.filter(t => tripDone(t, today));
  const e100 = eur100Of(D.expenses), kmOf = t => (t.kmIni && t.kmFin ? t.kmFin - t.kmIni : +t.kmRuta || 0);
  const kmTot = past.reduce((s, t) => s + kmOf(t), 0), nights = past.reduce((s, t) => s + nightsOf(t), 0);
  const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const row = t => { const n = nightsOf(t), tc = tripCost(t, D, e100), real = t.kmIni && t.kmFin;
    return `<div class="trow"><a class="row" href="#/viaje/${t.id}"><span class="ico">${icon('map')}</span><span class="m"><b>${esc(t.nombre)}</b>
      <small>${t.inicio ? fDate(t.inicio) + (t.inicio > today ? ' (' + rel(t.inicio) + ')' : tripOpen(t, today) ? ' · de viaje, sin fecha de vuelta' : '') : 'Sin fecha'} · ${kmOf(t) ? fKm(kmOf(t)) + (real ? '' : ' previstos') : pl((t.paradas || []).length, 'parada', 'paradas')}${n ? ' · ' + pl(n, 'noche', 'noches') : ''}</small></span>
      <span class="r">${tc.total && tripDone(t, today) ? `<b>${fEur(tc.total)}</b>${tc.estimated ? '<small>coste ≈</small>' : ''}` : ''}</span></a>
      <button class="ib" data-del="${t.id}" aria-label="Borrar el viaje ${esc(t.nombre)}" title="Borrar">${icon('trash')}</button></div>`; };

  view.innerHTML = `<div class="vh"><div><h1>Viajes</h1><p>${past.length ? `${pl(past.length, 'viaje hecho', 'viajes hechos')} · ${fKm(kmTot)} · ${pl(nights, 'noche', 'noches')}` : up.length ? pl(up.length, 'viaje planificado', 'viajes planificados') : 'Ningún viaje todavía'}</p></div><button class="btn" id="add">${icon('plus')}Viaje</button></div>
    ${!all.length ? `<div class="empty"><h3>Planifica tu primer viaje</h3><p>Marca la salida, las paradas y dónde duermes. Te calculo los kilómetros, el tiempo y lo que gastarás en gasóleo.</p><button class="btn" id="add2">${icon('plus')}Nuevo viaje</button></div>` : ''}
    ${up.length ? `<div class="gh"><span>Próximos y en curso</span><span>${up.length}</span></div><div class="list">${up.map(row).join('')}</div>` : ''}
    ${past.length ? `<div class="gh"><span>Hechos</span><span>${past.length}</span></div><div class="list">${past.map(row).join('')}</div>` : ''}
    <div class="pb"></div>`;
  view.querySelector('#add').onclick = () => tripMeta();
  const a2 = view.querySelector('#add2'); if (a2) a2.onclick = () => tripMeta();
  view.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => deleteTrip(D.trips.find(t => t.id === b.dataset.del))));
  if (params[0] === 'nuevo') { history.replaceState(history.state, '', '#/viajes'); tripMeta(); }
}
export const nightsOf = (t, today = isoToday()) => {
  if (t.inicio && t.fin && t.fin > t.inicio) return daysBetween(t.inicio, t.fin);
  const st = (t.paradas || []).filter(p => NIGHT.has(p.tipo)).length;
  // Viaje abierto (sin fecha de vuelta): las noches que llevas fuera, o las planificadas si son más
  return tripOpen(t, today) ? Math.max(daysBetween(t.inicio, today), st) : st;
};

/* ---------- Datos generales del viaje ---------- */
const metaF = t => [
  { k: 'nombre', l: 'Nombre del viaje', full: 1, ph: 'Ej. Picos de Europa, Semana Santa', req: 'Pon un nombre al viaje', minLen: 3, maxLen: 60,
    check: v => D.trips.some(x => x.id !== t.id && normKey(x.nombre) === normKey(v)) ? 'Ya tienes un viaje con ese nombre' : null },
  { k: 'inicio', l: 'Salida', t: 'date', minDate: '2000-01-01', maxDate: () => addMonths(isoToday(), 60) },
  { k: 'fin', l: 'Vuelta', t: 'date', minDate: '2000-01-01', maxDate: () => addMonths(isoToday(), 61), after: 'inicio', afterMsg: 'La vuelta no puede ser antes de la salida' },
  { k: 'notas', adv: 1, l: 'Notas', t: 'textarea', maxLen: 2000 },
];
const uniqueName = base => { let n = base, i = 2; while (D.trips.some(x => normKey(x.nombre) === normKey(n))) n = `${base} (${i++})`; return n.slice(0, 60); };

function tripMeta(t = {}) {
  const isNew = !t.id, F = metaF(t);
  sheet({
    title: isNew ? 'Nuevo viaje' : 'Datos del viaje', body: form(F, t),
    foot: (isNew ? '' : `<button class="btn d" data-del>${icon('trash')}Eliminar</button><button class="btn g" data-dup>Duplicar</button>`) + `<button class="btn" data-save>${icon('check')}${isNew ? 'Crear y abrir mapa' : 'Guardar'}</button>`,
    onMount: s => {
      onSubmit(s, F, v => {
        const er = [];
        if (v.fin && !v.inicio) er.push({ k: 'inicio', msg: 'Si pones la vuelta, indica también la salida' });
        if (v.inicio && v.fin && v.fin < v.inicio) er.push({ k: 'fin', msg: 'La vuelta no puede ser antes de la salida' });
        if (v.inicio && v.fin && daysBetween(v.inicio, v.fin) > 365) er.push({ k: 'fin', msg: 'Un viaje de más de un año: revisa las fechas' });
        // Si ya hay km apuntados, las fechas nuevas tienen que seguir cuadrando con ellos
        if (t.kmIni && !v.inicio) er.push({ k: 'inicio', msg: 'Ya apuntaste los km de salida: la fecha de salida es necesaria' });
        if (t.kmIni && v.inicio > isoToday()) er.push({ k: 'inicio', msg: 'Ya apuntaste los km de salida: el viaje no puede empezar en el futuro' });
        if (t.kmFin && !v.fin) er.push({ k: 'fin', msg: 'Ya apuntaste los km de vuelta: la fecha de vuelta es necesaria' });
        if (t.kmFin && v.fin > isoToday()) er.push({ k: 'fin', msg: 'Ya apuntaste los km de vuelta: la vuelta no puede ser futura' });
        if (!er.length && t.kmIni) er.push({ k: 'inicio', msg: kmMsg(v.inicio, t.kmIni, t.id) });
        if (!er.length && t.kmFin) er.push({ k: 'fin', msg: kmMsg(v.fin, t.kmFin, t.id) });
        return er;
      }, async v => {
        // Salida ya pasada y sin vuelta: el viaje quedará abierto («estás de viaje»). Se confirma, por si fue una escapada ya hecha.
        if (v.inicio && v.inicio < isoToday() && !v.fin && !t.kmFin && (isNew || t.fin || t.inicio !== v.inicio)) {
          const sigo = await ask({ title: '¿Sigues de viaje?', text: `Sales el ${fDate(v.inicio)} y no has puesto la vuelta. El viaje quedará en curso hasta que apuntes que has vuelto.`, ok: 'Sí, sigo de viaje', cancel: 'Ya volví: pongo la fecha' });
          if (!sigo) { const f = s.el.querySelector('[name=fin]'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } return ''; }
        }
        if (!isNew && t.cerrado && !t.kmFin && (!v.fin || v.fin > isoToday())) delete t.cerrado;
        const rec = isNew ? await put('trips', { paradas: [], ...v }) : await put('trips', Object.assign(t, v));
        await s.close();
        if (isNew) go('viaje/' + rec.id); else { toast('Viaje guardado'); refresh(); }
      });
      const d = s.el.querySelector('[data-del]');
      if (d) d.onclick = () => deleteTrip(t, () => s.close());
      const dp = s.el.querySelector('[data-dup]');
      if (dp) dp.onclick = async () => {
        const c = await put('trips', { nombre: uniqueName(t.nombre.replace(/ \(\d+\)$/, '') + ' (copia)'), paradas: (t.paradas || []).map(p => ({ ...p, id: uid() })), kmRuta: t.kmRuta, durMin: t.durMin, legs: t.legs, fuente: t.fuente, notas: t.notas });
        s.close().then(() => go('viaje/' + c.id)); toast('Viaje duplicado: cambia las fechas');
      };
    }
  });
}

/** Borrar un viaje: pregunta antes, sus gastos se conservan y se puede deshacer (también devuelve los gastos) */
async function deleteTrip(t, before) {
  const g = D.expenses.filter(e => e.viajeId === t.id).length;
  if (!(await ask({ title: `¿Borrar el viaje «${t.nombre}»?`, text: g ? `Sus ${g} ${g === 1 ? 'gasto se conserva' : 'gastos se conservan'} en Gastos, sin viaje asignado.` : 'Se borran la ruta y las paradas.', ok: 'Sí, borrar', cancel: 'No', danger: true }))) return false;
  const old = { ...t }, linked = D.expenses.filter(e => e.viajeId === t.id).map(e => e.id);
  for (const e of D.expenses.filter(e => e.viajeId === t.id)) await put('expenses', { ...e, viajeId: '' });
  await del('trips', t.id);
  if (before) await before();
  if (location.hash === '#/viajes') refresh(); else go('viajes');
  undo('Viaje borrado', async () => {
    await put('trips', old);
    for (const e of D.expenses.filter(e => linked.includes(e.id))) await put('expenses', { ...e, viajeId: old.id });
    refresh();
  });
  return true;
}

/* ---------- Km reales de salida y de vuelta ---------- */
export function tripKmSheet(t, which, done) {
  const today = isoToday(), ini = which === 'ini', cur = currentKm(D);
  const F = ini
    ? [{ k: 'km', l: 'Km al salir', t: 'number', ...R.km, req: 'Indica los km del cuentakilómetros', help: cur ? `Último dato: ${fKm(cur)}` : '' }]
    : [{ k: 'fin', l: 'Fecha de vuelta', t: 'date', req: 'Indica cuándo volviste', past: true, minDate: t.inicio, help: t.fin && t.fin !== today ? 'Si volviste antes o después de lo previsto, cámbiala' : '' },
       t.kmIni ? { k: 'km', l: 'Km al volver', t: 'number', ...R.km, req: 'Indica los km del cuentakilómetros', help: `Al salir: ${fKm(t.kmIni)}` }
         : { k: 'km', l: 'Km al volver (opcional)', t: 'number', ...R.km, help: cur ? `Último dato: ${fKm(cur)}. Sin los km de salida no puedo saber lo recorrido, pero ayudan al resto de cálculos` : '' }];
  const val = ini ? { km: t.kmIni || (t.inicio === today && cur ? cur : '') } : { fin: t.kmFin ? t.fin : t.fin && t.fin <= today ? t.fin : today, km: t.kmFin || '' };
  const has = ini ? t.kmIni : t.kmFin || t.cerrado;
  sheet({
    title: ini ? 'Km al salir · ' + fDate(t.inicio) : t.kmIni ? 'He vuelto: km al volver' : 'He vuelto', body: form(F, val),
    foot: `${has ? `<button class="btn d" data-del>${icon('trash')}${!ini && !t.kmFin ? 'Aún no he vuelto' : 'Borrar'}</button>` : ''}<button class="btn" data-save>${icon('check')}Guardar</button>`,
    onMount: s => {
      onSubmit(s, F, v => {
        if (ini) {
          if (t.kmFin && v.km > t.kmFin) return [{ k: 'km', msg: `No pueden ser más que al volver (${fKm(t.kmFin)})` }];
          return [{ k: 'km', msg: kmMsg(t.inicio, v.km, t.id) }];
        }
        if (v.km === '') return [];
        if (t.kmIni && v.km < t.kmIni) return [{ k: 'km', msg: `No pueden ser menos que al salir (${fKm(t.kmIni)})` }];
        if (t.kmIni && v.km - t.kmIni > 30000) return [{ k: 'km', msg: `Son ${fKm(v.km - t.kmIni)} en un viaje: revisa la cifra` }];
        return [{ k: 'km', msg: kmMsg(v.fin, v.km, t.id) }];
      }, async v => {
        // «He vuelto» cierra el viaje aunque sea hoy y sin km (si no, seguiría «en curso» hasta mañana)
        if (ini) t.kmIni = v.km; else { if (v.km !== '') t.kmFin = v.km; else delete t.kmFin; t.fin = v.fin; t.cerrado = true; }
        await put('trips', t);
        await s.close(); toast(ini ? 'Km de salida apuntados' : t.kmIni && t.kmFin ? `Viaje cerrado: ${fKm(t.kmFin - t.kmIni)} recorridos` : 'Viaje cerrado. ¡Bienvenido a casa!'); done();
      });
      const d = s.el.querySelector('[data-del]');
      if (d) d.onclick = async () => {
        const both = ini && t.kmFin, reopen = !ini && !t.kmFin;
        if (!(await ask({ title: both ? '¿Borrar los km de salida y de vuelta?' : reopen ? '¿Reabrir el viaje?' : '¿Borrar estos km?', text: both ? 'Sin los km de salida, los de vuelta no sirven y se borran también.' : '', ok: reopen ? 'Sí, sigo de viaje' : 'Sí, borrar', cancel: 'No', danger: !reopen }))) return;
        if (ini) { delete t.kmIni; delete t.kmFin; } else { delete t.kmFin; delete t.cerrado; }
        await put('trips', t); await s.close(); toast('Km borrados'); done();
      };
    }
  });
}

/* ---------- Leaflet bajo demanda (solo se descarga al abrir un viaje) ---------- */
let leafletP;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP || (leafletP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
    const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; js.crossOrigin = '';
    js.onload = () => res(window.L); js.onerror = () => { leafletP = null; rej(new Error('No se pudo cargar el mapa')); };
    document.head.append(css, js);
  }));
}

/* ---------- Rutas: OSRM (perfil coche) con respaldo en línea recta ---------- */
const geomCache = new Map();
async function routeOf(stops, factor) {
  const pts = stops.map(p => [p.lat, p.lon]);
  const key = pts.map(p => p.join(',')).join(';');
  if (geomCache.has(key)) return geomCache.get(key);
  const straight = () => {
    const legs = []; for (let i = 1; i < stops.length; i++) legs.push(haversine(stops[i - 1], stops[i]) * 1.25);
    const km = legs.reduce((a, b) => a + b, 0);
    return { fuente: 'estimada', km, legs, durMin: km / 70 * 60 * factor, geom: null };
  };
  if (!navigator.onLine) return straight();
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${pts.map(p => p[1] + ',' + p[0]).join(';')}?overview=full&geometries=geojson&steps=false`, { signal: timeout(12000) });
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error(j.code || 'sin ruta');
    const rt = j.routes[0];
    const out = { fuente: 'carretera', km: rt.distance / 1000, legs: rt.legs.map(l => l.distance / 1000), durMin: rt.duration / 60 * factor, geom: rt.geometry.coordinates.map(c => [c[1], c[0]]) };
    geomCache.set(key, out);
    return out;
  } catch (e) { return straight(); }
}

/* ---------- Búsqueda de direcciones (Nominatim, OpenStreetMap) ---------- */
// Con cobertura mala nada se queda esperando para siempre: cada petición tiene un tiempo máximo
function timeout(ms, parent) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  if (parent) parent.addEventListener('abort', () => { clearTimeout(t); c.abort(); });
  return c.signal;
}
async function geocode(q, signal) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q=${encodeURIComponent(q)}`, { signal: timeout(10000, signal) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).map(x => ({ lat: +x.lat, lon: +x.lon, label: x.display_name.split(',').slice(0, 2).join(',').trim(), full: x.display_name }));
}
async function reverse(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=es&lat=${lat}&lon=${lon}`, { signal: timeout(10000) });
    const j = await r.json(); const a = j.address || {};
    return a.village || a.town || a.city || a.hamlet || a.municipality || (j.display_name || '').split(',')[0] || null;
  } catch (e) { return null; }
}

/* ---------- Editor de viaje ---------- */
export function renderTrip(view, [id]) {
  const t = D.trips.find(x => x.id === id);
  if (!t) { view.innerHTML = `<div class="empty"><h3>Viaje no encontrado</h3><a class="btn" href="#/viajes">Volver a viajes</a></div>`; return; }
  t.paradas = t.paradas || [];
  const p = prefs(), v = vehicle(), factor = +p.timeFactor || 1.2;
  const cons = consumption(D.expenses), price = lastFuelPrice(D.expenses), e100 = eur100Of(D.expenses);
  let map = null, layer = null, line = null, alive = true, saveT, tok = 0;

  view.innerHTML = `<div class="vh"><div style="min-width:0"><a class="back" href="#/viajes">${icon('left')}Viajes</a><h1 id="tn">${esc(t.nombre)}</h1>
      <p id="tm"></p></div><button class="btn g sm" id="meta">${icon('edit')}Datos</button></div>
    <div class="grid2">
      <div>
        <div class="mapw"><div id="map"></div><div class="maphint" id="mh">Cargando mapa…</div></div>
        <div class="kpis k3" style="margin-top:14px" id="tot"></div>
        <div id="warn"></div>
        <div class="sec" style="margin-top:18px"><h2>Kilómetros reales</h2><div id="kmr"></div></div>
      </div>
      <div>
        <div class="sec"><h2>Paradas</h2>
          <div class="srch" style="margin-bottom:10px">${icon('pin')}<input id="q" type="search" placeholder="Buscar pueblo, área, camping…" autocomplete="off" aria-label="Buscar lugar"><div class="sugg" id="sg" hidden></div></div>
          <div id="pl"></div>
          <div class="list" id="st"></div>
          <div class="brow" style="margin-top:10px"><button class="btn g sm" id="gps">${icon('gps')}Mi ubicación</button><button class="btn g sm" id="gm">${icon('ext')}Google Maps</button><button class="btn g sm" id="shr">${icon('share')}Compartir</button></div>
        </div>
        <div class="sec" style="margin-top:22px"><h2>Gastos del viaje <button id="ga">+ Añadir</button></h2><div id="gl"></div></div>
        ${t.notas ? `<div class="sec" style="margin-top:22px"><h2>Notas</h2><div class="card" style="white-space:pre-wrap">${esc(t.notas)}</div></div>` : ''}
      </div>
    </div>
    <div class="brow" style="margin-top:26px"><button class="btn d" id="dtr">${icon('trash')}Borrar este viaje</button></div><div class="pb"></div>`;

  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (D.trips.includes(t)) put('trips', t).catch(e => toast('No se ha podido guardar el viaje: ' + (e.message || e))); }, 300); };
  const meta = () => {
    const n = nightsOf(t), real = t.kmIni && t.kmFin ? t.kmFin - t.kmIni : null;
    $('#tm').textContent = [t.inicio ? fDate(t.inicio) + (t.fin ? ' → ' + fDate(t.fin) : tripOpen(t) ? ' → de viaje, sin fecha de vuelta' : '') : 'Sin fechas', n ? n + (n === 1 ? ' noche' : ' noches') : '', real ? fKm(real) + ' reales' : ''].filter(Boolean).join(' · ');
  };

  function totals() {
    const km = +t.kmRuta || 0, tc = tripCost(t, D, e100);
    const fuelSub = tc.fuelUsed
      ? (tc.kmReal ? `consumido en ${fKm(tc.km)}` : 'previsto para la ruta')
      : tc.fuelPaid ? 'pagado en ruta' : !tc.km ? 'añade paradas' : 'faltan dos llenos con km';
    $('#tot').innerHTML = `<div class="kpi"><span class="l">${icon('map')}Ruta</span><span class="v">${fKm(km)}</span><span class="s">${t.fuente === 'estimada' ? '≈ estimada sin conexión' : t.paradas.length > 1 ? 'por carretera' : 'añade paradas'}</span></div>
      <div class="kpi"><span class="l">${icon('clock')}Conducción</span><span class="v">${km ? fDur(t.durMin) : '—'}</span><span class="s">ritmo autocaravana ×${fNum(factor, 2)}</span></div>
      <div class="kpi"><span class="l">${icon('fuel')}Gasóleo</span><span class="v">${tc.fuelUsed ? '≈ ' + fEur(tc.fuelUsed) : tc.fuelPaid ? fEur(tc.fuelPaid) : '—'}</span><span class="s">${fuelSub}</span></div>`;
    const h = +v.altura;
    $('#warn').innerHTML = t.paradas.length > 1 ? `<p class="fm warn" style="margin-top:12px">${icon('alert')} La ruta es la de un coche: no tiene en cuenta ${h ? `tu altura (${fNum(h, 2)} m)` : 'la altura'}, el peso ni calles estrechas. Revisa túneles, puertos y cascos urbanos antes de salir.</p>` : '';
  }

  function stopsList() {
    const legs = t.legs || [];
    const placeIds = new Set(D.places.map(p => p.lat.toFixed(4) + ',' + p.lon.toFixed(4)));
    $('#st').innerHTML = t.paradas.length ? t.paradas.map((s, i) => {
      const fav = placeIds.has(s.lat.toFixed(4) + ',' + s.lon.toFixed(4));
      const seg = i && legs[i - 1] !== undefined ? `+${fNum(legs[i - 1], 0)} km` : i ? '' : 'Salida';
      return `<div class="stop" data-i="${i}"><span class="n" style="${NIGHT.has(s.tipo) ? 'background:#22395a' : ''}">${i + 1}</span>
        <div class="m"><input value="${esc(s.label)}" maxlength="60" data-l aria-label="Nombre de la parada ${i + 1}"><small><span>${seg}</span>
          <select data-ty aria-label="Tipo">${STOP_TIPOS.map(([k, l]) => `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></small></div>
        <button class="ib ${fav ? 'fav' : ''}" data-fv aria-label="${fav ? 'Quitar de mis lugares' : 'Guardar en mis lugares'}" title="Mis lugares">${icon('star')}</button>
        <button class="ib" data-u ${i ? '' : 'disabled'} aria-label="Subir">${icon('up')}</button>
        <button class="ib" data-d ${i < t.paradas.length - 1 ? '' : 'disabled'} aria-label="Bajar">${icon('down')}</button>
        <button class="ib" data-x aria-label="Quitar">${icon('x')}</button></div>`;
    }).join('') : `<div class="empty sm">Busca un lugar arriba o toca el mapa para marcar la salida.</div>`;
    places();
  }

  function places() {
    const used = {}; D.trips.forEach(x => (x.paradas || []).forEach(s => { const k = s.lat.toFixed(4) + ',' + s.lon.toFixed(4); used[k] = (used[k] || 0) + 1; }));
    const ps = D.places.slice().sort((a, b) => (used[b.lat.toFixed(4) + ',' + b.lon.toFixed(4)] || 0) - (used[a.lat.toFixed(4) + ',' + a.lon.toFixed(4)] || 0));
    $('#pl').innerHTML = ps.length ? `<div class="chips" style="margin-bottom:10px">${ps.slice(0, 14).map(p => `<button class="chip" data-p="${p.id}">${icon('star')}${esc(p.label)}</button>`).join('')}</div>` : '';
  }

  function draw() {
    if (!map) return;
    layer.clearLayers();
    t.paradas.forEach((s, i) => {
      const cls = NIGHT.has(s.tipo) ? 'n' : '';
      const m = L.marker([s.lat, s.lon], { draggable: true, icon: L.divIcon({ className: '', html: `<div class="pin ${cls}">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
      m.bindTooltip(esc(s.label));
      m.on('dragend', () => { const ll = m.getLatLng(); s.lat = ll.lat; s.lon = ll.lng; save(); recalc(); });
      m.addTo(layer);
    });
    if (line) { map.removeLayer(line); line = null; }
    const col = getComputedStyle(document.documentElement).getPropertyValue('--em2').trim() || '#059669';
    const g = geomCache.get(t.paradas.map(p => p.lat + ',' + p.lon).join(';'));
    if (g && g.geom) line = L.polyline(g.geom, { color: col, weight: 4, opacity: .9 }).addTo(map);
    else if (t.paradas.length > 1) line = L.polyline(t.paradas.map(p => [p.lat, p.lon]), { color: col, weight: 3, dashArray: '3 8' }).addTo(map);
    $('#mh').textContent = (navigator.onLine ? '' : 'Sin conexión: el mapa puede verse en gris. ') + (t.paradas.length ? 'Toca el mapa para añadir una parada. Arrastra los marcadores para moverlas.' : 'Toca el mapa para marcar la salida.');
  }

  async function recalc() {
    const my = ++tok;
    stopsList(); draw();
    if (t.paradas.length < 2) { Object.assign(t, { kmRuta: 0, durMin: 0, legs: [], fuente: '' }); save(); totals(); return; }
    $('#tot .v').textContent = '…';
    const r = await routeOf(t.paradas, factor);
    if (!alive || my !== tok) return;
    Object.assign(t, { kmRuta: Math.round(r.km * 10) / 10, durMin: Math.round(r.durMin), legs: r.legs.map(x => Math.round(x * 10) / 10), fuente: r.fuente });
    save(); stopsList(); draw(); totals();
  }

  async function addStop(lat, lon, label, tipo) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return toast('Ubicación no válida');
    if (t.paradas.length >= 60) return toast('Máximo 60 paradas por viaje: divídelo en dos');
    const last = t.paradas[t.paradas.length - 1];
    if (last && haversine(last, { lat, lon }) < 0.05) return toast('Esa parada ya es la última de la lista');
    const s = { id: uid(), lat, lon, label: normText(label).slice(0, 60) || 'Punto en el mapa', tipo: tipo || (t.paradas.length ? prefs().defStop || 'visita' : 'visita') };
    t.paradas.push(s); recalc();
    if (!label) { const n = await reverse(lat, lon); if (n && s.label === 'Punto en el mapa' && alive) { s.label = n; save(); stopsList(); draw(); } }
  }

  // Interacción con la lista de paradas
  $('#st').addEventListener('change', e => {
    const r = e.target.closest('[data-i]'); if (!r) return; const s = t.paradas[+r.dataset.i];
    if (e.target.matches('[data-l]')) { const n = normText(e.target.value).slice(0, 60); if (!n) { e.target.value = s.label; toast('La parada necesita un nombre'); return; } s.label = n; e.target.value = n; save(); draw(); }
    if (e.target.matches('[data-ty]')) { s.tipo = e.target.value; save(); draw(); stopsList(); meta(); }
  });
  $('#st').addEventListener('click', async e => {
    const b = e.target.closest('button'); const r = e.target.closest('[data-i]'); if (!b || !r) return; const i = +r.dataset.i, s = t.paradas[i];
    if (b.matches('[data-u]') && i > 0) { [t.paradas[i - 1], t.paradas[i]] = [t.paradas[i], t.paradas[i - 1]]; recalc(); }
    else if (b.matches('[data-d]') && i < t.paradas.length - 1) { [t.paradas[i + 1], t.paradas[i]] = [t.paradas[i], t.paradas[i + 1]]; recalc(); }
    else if (b.matches('[data-x]')) { t.paradas.splice(i, 1); recalc(); undo(`«${s.label}» quitada`, () => { t.paradas.splice(i, 0, s); recalc(); }); }
    else if (b.matches('[data-fv]')) {
      const k = s.lat.toFixed(4) + ',' + s.lon.toFixed(4), ex = D.places.find(p => p.lat.toFixed(4) + ',' + p.lon.toFixed(4) === k);
      if (ex) { await del('places', ex.id); toast('Quitado de mis lugares'); } else { await put('places', { label: s.label, lat: s.lat, lon: s.lon, tipo: s.tipo }); toast('Guardado en mis lugares'); }
      stopsList();
    }
  });
  $('#pl').addEventListener('click', e => { const c = e.target.closest('[data-p]'); if (!c) return; const p = D.places.find(x => x.id === c.dataset.p); addStop(p.lat, p.lon, p.label, p.tipo); if (map) map.panTo([p.lat, p.lon]); });

  // Búsqueda con espera para no saturar el servicio (máx. 1 petición por segundo)
  let qt, qa;
  const q = $('#q'), sg = $('#sg');
  q.addEventListener('input', () => {
    clearTimeout(qt); if (qa) qa.abort();
    const v = q.value.trim(); if (v.length < 3) { sg.hidden = true; return; }
    qt = setTimeout(async () => {
      if (!navigator.onLine) { sg.innerHTML = '<button disabled>Sin conexión: toca el mapa</button>'; sg.hidden = false; return; }
      const my = qa = new AbortController();
      sg.innerHTML = '<button disabled>Buscando…</button>'; sg.hidden = false;
      try {
        const res = await geocode(v, my.signal);
        if (my !== qa || my.signal.aborted) return;
        sg.innerHTML = res.length ? res.map((r, i) => `<button data-r="${i}">${esc(r.label)}<small>${esc(r.full)}</small></button>`).join('') : '<button disabled>Sin resultados. Prueba con el nombre del pueblo.</button>';
        sg.hidden = false;
        sg.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => { const r = res[+b.dataset.r]; addStop(r.lat, r.lon, r.label); q.value = ''; sg.hidden = true; if (map) map.setView([r.lat, r.lon], Math.max(map.getZoom(), 9)); }));
      } catch (e) {
        if (my !== qa || my.signal.aborted && q.value.trim() !== v) return; // la ha sustituido otra búsqueda
        sg.innerHTML = `<button disabled>${e.name === 'AbortError' ? 'La conexión va muy lenta. Prueba otra vez o toca el mapa.' : 'No se pudo buscar ahora. Toca el mapa para marcar el sitio.'}</button>`; sg.hidden = false;
      }
    }, 700);
  });
  const outside = e => { if (!e.target.closest('.srch')) sg.hidden = true; };
  document.addEventListener('click', outside);

  $('#gps').onclick = () => {
    if (!navigator.geolocation) return toast('Este dispositivo no da la ubicación');
    toast('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(p => { addStop(p.coords.latitude, p.coords.longitude); if (map) map.setView([p.coords.latitude, p.coords.longitude], 12); },
      e => toast(e.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación'), { enableHighAccuracy: true, timeout: 12000 });
  };
  $('#gm').onclick = () => {
    if (t.paradas.length < 2) return toast('Añade al menos dos paradas');
    const P = t.paradas, ll = p => p.lat.toFixed(6) + ',' + p.lon.toFixed(6), mid = P.slice(1, -1);
    if (mid.length > 9) toast('Google Maps solo admite 9 paradas intermedias: se abren las primeras');
    let u = `https://www.google.com/maps/dir/?api=1&origin=${ll(P[0])}&destination=${ll(P[P.length - 1])}&travelmode=driving`;
    if (mid.length) u += '&waypoints=' + mid.slice(0, 9).map(ll).map(encodeURIComponent).join('%7C');
    window.open(u, '_blank', 'noopener');
  };
  $('#shr').onclick = async () => {
    const lines = [`🚐 ${t.nombre}${t.inicio ? ' — ' + fDate(t.inicio) : ''}`, ...t.paradas.map((s, i) => `${i + 1}. ${s.label}${NIGHT.has(s.tipo) ? ' 🌙' : ''}`), '', `Total: ${fKm(t.kmRuta)} · ${fDur(t.durMin)} de conducción`];
    const text = lines.join('\n');
    try { if (navigator.share) await navigator.share({ title: t.nombre, text }); else { await navigator.clipboard.writeText(text); toast('Resumen copiado'); } } catch (e) {}
  };
  $('#meta').onclick = () => tripMeta(t);
  $('#dtr').onclick = () => { clearTimeout(saveT); deleteTrip(t); };

  // Gastos del viaje
  const gl = () => {
    const g = D.expenses.filter(e => e.viajeId === t.id).sort((a, b) => a.fecha.localeCompare(b.fecha)), tc = tripCost(t, D, e100), n = nightsOf(t);
    const rowsHtml = g.map(e => `<button class="row" data-e="${e.id}"><span class="m"><b>${esc(e.concepto || e.cat)}</b><small>${fDate(e.fecha, { day: 'numeric', month: 'short' })} · ${esc(e.cat)}</small></span><span class="r"><b>${fEur(e.importe)}</b></span></button>`).join('');
    const sum = (tc.other || tc.fuelPaid || tc.fuelUsed) ? `<div class="row tot"><span class="m"><b>${tc.estimated ? 'Coste del viaje ≈' : 'Total pagado'}</b>
        <small class="wrap">${tc.estimated ? `${fEur(tc.other)} en gastos + ${fEur(tc.fuelUsed)} de gasóleo consumido` : ''}${tc.perKm ? (tc.estimated ? ' · ' : '') + fNum(tc.perKm, 2) + ' €/km' : ''}${n && tc.total ? ' · ' + fEur(tc.total / n) + ' por noche' : ''}</small></span><span class="r"><b>${fEur(tc.total)}</b></span></div>` : '';
    $('#gl').innerHTML = g.length || tc.fuelUsed ? `<div class="list">${rowsHtml}${sum}</div>${tc.estimated && tc.fuelPaid ? `<p class="hint" style="margin:8px 4px 0">Los repostajes de la lista son lo que pagaste en ruta. En el coste del viaje cuento el gasóleo que consumiste (sales y vuelves con combustible en el depósito).</p>` : ''}`
      : `<div class="list"><div class="empty sm">Los gastos que asignes a este viaje aparecerán aquí.</div></div>`;
    $('#gl').querySelectorAll('[data-e]').forEach(b => (b.onclick = () => expenseSheet(D.expenses.find(x => x.id === b.dataset.e))));
  };
  $('#ga').onclick = () => expenseSheet({}, { viajeId: t.id, cat: 'Área / camping', fecha: t.inicio && isoToday() > t.inicio && (!t.fin || isoToday() <= t.fin) ? isoToday() : t.inicio || isoToday() });

  // Km reales: solo se piden cuando tiene sentido (al salir y al volver), con el dato actual ya puesto
  const kmr = () => {
    const today = isoToday(), el = $('#kmr');
    if (!t.inicio) { el.innerHTML = `<div class="list"><div class="empty sm">Pon la fecha de salida en «Datos» y aquí podrás apuntar los km al salir y al volver.</div></div>`; return; }
    if (t.inicio > today) { el.innerHTML = `<div class="list"><div class="empty sm">Sales ${rel(t.inicio)}. Ese día, apunta aquí los km del cuentakilómetros.</div></div>`; return; }
    const real = t.kmIni && t.kmFin ? t.kmFin - t.kmIni : null, dif = real && t.kmRuta ? Math.round((real - t.kmRuta) / t.kmRuta * 100) : null;
    const row = (k, title, sub, val) => `<button class="row" data-km="${k}"><span class="ico">${icon(k === 'ini' ? 'gauge' : 'check')}</span><span class="m"><b>${title}</b><small>${sub}</small></span><span class="r">${val ? `<b>${fKm(val)}</b>` : `<span class="btn sm${k === 'fin' && t.cerrado ? ' g' : ''}">${k === 'fin' && t.cerrado ? 'Cambiar' : 'Apuntar'}</span>`}</span></button>`;
    el.innerHTML = `<div class="list">
      ${row('ini', 'Al salir', fDate(t.inicio), t.kmIni)}
      ${row('fin', t.kmIni ? 'Al volver' : 'He vuelto', t.kmFin ? fDate(t.fin) : t.cerrado && t.fin ? `Volviste el ${fDate(t.fin)}` : t.fin && t.fin > today ? 'Vuelves ' + rel(t.fin) + ': apúntalo al llegar' : t.fin ? `Volviste el ${fDate(t.fin)}${t.kmIni ? ': apunta los km' : ''}` : 'Sin fecha de vuelta: tócalo cuando llegues', t.kmFin)}
      ${real !== null ? `<div class="row"><span class="m"><b>${fKm(real)} recorridos</b><small>${dif !== null ? `La ruta planificada era de ${fKm(t.kmRuta)} (${dif > 0 ? '+' : ''}${dif} %)` : ''}</small></span></div>` : ''}
    </div>`;
    el.querySelectorAll('[data-km]').forEach(b => (b.onclick = () => tripKmSheet(t, b.dataset.km, () => { meta(); kmr(); gl(); totals(); })));
  };
  meta(); stopsList(); totals(); gl(); kmr();

  // Mapa: se carga aparte. La vista ya está lista y si sales antes de que llegue, no se pinta en otra pantalla.
  (async () => { try {
    await loadLeaflet();
    if (!alive) return;
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([40.2, -3.6], 5);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Mapa © Esri, HERE, Garmin, © OpenStreetMap · Rutas © OSRM'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', e => addStop(e.latlng.lat, e.latlng.lng));
    $('.leaflet-tile-pane').style.filter = [p.mapGray ? 'grayscale(1) contrast(1.08)' : '', document.documentElement.dataset.theme === 'dark' ? 'brightness(.75) contrast(1.1)' + (p.mapGray ? '' : ' saturate(.8)') : ''].join(' ').trim();
    if (t.paradas.length) map.fitBounds(L.latLngBounds(t.paradas.map(p => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 12 });
    draw();
    if (t.paradas.length > 1) recalc();
    setTimeout(() => map && map.invalidateSize(), 200);
  } catch (e) {
    if (alive && $('#mh')) $('#mh').textContent = 'No se ha podido cargar el mapa (¿sin conexión?). Puedes seguir editando la lista y las paradas guardadas.';
  } })();

  return () => { alive = false; clearTimeout(saveT); if (D.trips.includes(t)) put('trips', t).catch(() => {}); document.removeEventListener('click', outside); if (map) { map.remove(); map = null; } };
}
