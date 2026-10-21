// Ajustes por secciones (como en Noticiahz). Cada sección es una función: añadir una nueva es añadir una entrada a SECS.
import { D, dump, restore, wipe, setKV, getKV, STORES, put, del } from '../db.js';
import { esc, icon, fKm, fDate, sheet, form, toast, download, ago, undo } from '../ui.js';
import { vehicle, prefs, ctx, tasksWithStatus, docsWithStatus, VER, STOP_TIPOS, PREF_DEFAULTS, needsProfilePlan, applyProfilePlan } from '../store.js';
import { ITV_CAT, PERFIL } from '../perfil.js';
import { isApp, isIOS, canPrompt, installed, install } from '../install.js';
import { isoToday, buildICS, currentKm } from '../logic.js';
import { vehicleSheet } from '../forms.js';
import { exportCSV } from './gastos.js';
import { go, refresh } from '../router.js';
import { PRESETS, FONT_SIZES, swatchHex, hexToHS, presetIndex, savePrefs } from '../theme.js';
import { onSubmit, normKey } from '../valid.js';

const SECS = [
  ['vehiculo', 'Vehículo', vehiculo],
  ['apariencia', 'Apariencia', apariencia],
  ['avisos', 'Avisos', avisos],
  ['viajes', 'Viajes', viajesSec],
  ['copia', 'Copia de seguridad', copia],
  ['avanzado', 'Avanzado', avanzado],
];

/** Control segmentado ligado a una preferencia */
const seg = (key, opts, cur) => `<div class="seg" data-pref="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
const sw = (key, title, sub, on) => `<div class="swr"><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><label class="sw"><input type="checkbox" data-pref-sw="${key}" ${on ? 'checked' : ''} aria-label="${esc(title)}"><span></span></label></div>`;
const set = (title, desc, body) => `<section class="set"><h3>${esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}${body}</section>`;
const lr = (id, ic, title, sub, cls = '') => `<button class="lr ${cls}" id="${id}" type="button">${icon(ic)}<div><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</div>${icon('right', 'chev')}</button>`;

export function render(view, [sec]) {
  const cur = SECS.find(s => s[0] === sec) || SECS[0];
  view.innerHTML = `<div class="vh"><div><h1>Ajustes</h1></div></div>
    <div class="stk"><div class="seg sc" id="secs" role="tablist">${SECS.map(([k, l]) => `<button role="tab" data-s="${k}" class="${k === cur[0] ? 'on' : ''}" aria-selected="${k === cur[0]}">${l}</button>`).join('')}</div></div>
    <div class="setw" id="sb"></div><div class="pb"></div>`;
  view.querySelector('#secs').onclick = e => { const b = e.target.closest('[data-s]'); if (b) go('ajustes/' + b.dataset.s); };
  const on = view.querySelector('#secs .on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  const body = view.querySelector('#sb');
  cur[2](body);
  // Preferencias genéricas: segmentados e interruptores
  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-pref] [data-v]'); if (!b) return;
    const k = b.closest('[data-pref]').dataset.pref, raw = b.dataset.v, v = isNaN(+raw) ? raw : +raw;
    await savePrefs({ [k]: v });
    b.parentNode.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    toast('Guardado');
  });
  body.addEventListener('change', async e => {
    const k = e.target.dataset.prefSw; if (!k) return;
    await savePrefs({ [k]: e.target.checked });
  });
}

/* ---------- Vehículo ---------- */
function vehiculo(el) {
  const v = vehicle(), nd = D.tasks.filter(t => !t.ultFecha && (t.ultKm === '' || t.ultKm == null)).length;
  const rows = [
    ['Nombre', v.nombre], ['Marca y modelo', v.marca], ['Base / motor', v.base], ['Tipo', v.carroceria], ['Matrícula', v.matricula],
    ['ITV', v.catITV ? (ITV_CAT.find(x => x[0] === v.catITV) || [, ''])[1] : 'Categoría sin indicar: mírala en la ficha técnica'],
    ['1ª matriculación', v.fechaMat && fDate(v.fechaMat)], ['Cuentakilómetros', fKm(currentKm(D))],
    ['Medidas', [v.altura && `alto ${v.altura} m`, v.longitud && `largo ${v.longitud} m`, v.anchura && `ancho ${v.anchura} m`].filter(Boolean).join(' · ')],
    ['Peso y depósitos', [v.mma && `MMA ${v.mma} kg`, v.deposito && `gasóleo ${v.deposito} L`, v.aguaLimpia && `agua ${v.aguaLimpia} L`].filter(Boolean).join(' · ')],
  ];
  el.innerHTML = set('Tu autocaravana', 'Las medidas se usan en los avisos de ruta y el depósito en la comprobación de repostajes.',
    `<div class="gc">${rows.map(([a, b]) => `<div class="row"><div><small>${a}</small><b>${esc(b || '—')}</b></div></div>`).join('')}</div>
     <button class="btn w" id="ve" style="margin-top:12px">${icon('edit')}Editar datos</button>`)
    + set('Plan de mantenimiento', `${D.tasks.length} tareas en el plan${nd ? ` · <b>${nd} sin «última vez»</b>` : ''}.`,
      `<div class="lrs">${lr('pc', 'cal', 'Indicar la última vez', nd ? `${nd} tareas sin fecha: no puedo avisarte de ellas` : 'Todas tienen fecha')}
       ${lr('ps', 'plus', 'Aplicar el plan del Ducato 1.9 TD', needsProfilePlan() ? 'Tienes tareas con intervalos genéricos: adáptalas' : 'Añade las tareas que falten, sin duplicar las tuyas')}
       ${lr('pv', 'wrench', 'Ver el plan', 'Intervalos, historial y notas')}</div>`);
  el.querySelector('#ve').onclick = () => vehicleSheet();
  el.querySelector('#pc').onclick = () => go('mant/completar');
  el.querySelector('#pv').onclick = () => go('mant');
  el.querySelector('#ps').onclick = async () => {
    const r = await applyProfilePlan();
    toast(r.upd + r.add + r.rem ? `Plan adaptado: ${r.upd} actualizadas, ${r.add} nuevas${r.rem ? ', ' + r.rem + ' retiradas' : ''}` : 'Tu plan ya está al día');
    if (r.add) go('mant/completar'); else vehiculo(el);
  };
}

/* ---------- Apariencia ---------- */
function apariencia(el) {
  const p = prefs(), sel = presetIndex(p);
  el.innerHTML = set('Tema', 'Automático sigue el modo claro u oscuro del móvil.', seg('theme', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']], p.theme))
    + set('Color', 'Se aplica a botones, avisos, logotipo e icono. El contraste se ajusta solo para que el texto siempre se lea.',
      `<div class="sws" id="sws" role="radiogroup" aria-label="Color de la app">${PRESETS.map(([n, h, s], i) => `<button class="swc ${i === sel ? 'on' : ''}" data-i="${i}" style="background:${swatchHex(h, s)}" role="radio" aria-checked="${i === sel}" aria-label="${n}" title="${n}"></button>`).join('')}</div>
       <div class="row" style="border:0;padding:14px 0 0"><div class="m"><b id="swn">${sel >= 0 ? PRESETS[sel][0] : 'Personalizado'}</b><small style="white-space:normal">O elige cualquier color con el selector.</small></div>
       <input type="color" id="acc" value="${sel === 0 ? '#059669' : swatchHex(p.ah, p.as)}" aria-label="Color personalizado" class="cpick"></div>`)
    + set('Tamaño del texto', '', seg('fs', FONT_SIZES, p.fs) + `<p class="hint" style="margin:10px 2px 0">Vista previa: <span style="font:600 calc(20px*var(--fs,1))/1.2 Newsreader,serif;color:var(--tx)">Cambio de aceite en 1.200 km</span></p>`)
    + set('Pantalla al abrir', 'La primera que ves al entrar en la app.', seg('start', [['inicio', 'Inicio'], ['mant', 'Mantenimiento'], ['viajes', 'Viajes'], ['gastos', 'Gastos'], ['stats', 'Estadísticas']], p.start))
    + set('Movimiento', '', `<div class="gc">${sw('reduceMotion', 'Reducir animaciones', 'Sin transiciones ni desplazamientos suaves', p.reduceMotion)}</div>`);
  const name = () => { const i = presetIndex(); el.querySelector('#swn').textContent = i >= 0 ? PRESETS[i][0] : 'Personalizado'; el.querySelectorAll('.swc').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-checked', k === i); }); };
  el.querySelector('#sws').onclick = async e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const [, h, s] = PRESETS[+b.dataset.i];
    await savePrefs(h == null ? { ah: undefined, as: undefined } : { ah: h, as: s });
    el.querySelector('#acc').value = swatchHex(h, s); name();
  };
  let t;
  el.querySelector('#acc').oninput = e => {
    const [h, s] = hexToHS(e.target.value);
    window.czApply && window.czApply(h, s);
    clearTimeout(t); t = setTimeout(async () => { await savePrefs({ ah: h, as: s }); name(); }, 250);
  };
}

/* ---------- Avisos ---------- */
function avisos(el) {
  const p = prefs();
  el.innerHTML = set('Antelación por fecha', 'Una tarea o un documento pasa a «Próximo» cuando le quedan estos días.', seg('warnDays', [[15, '15 días'], [30, '30 días'], [60, '60 días'], [90, '90 días']], p.warnDays))
    + set('Antelación por kilómetros', 'Una tarea por km pasa a «Próximo» cuando le quedan estos km.', seg('warnKm', [[500, '500 km'], [1000, '1.000 km'], [2000, '2.000 km'], [3000, '3.000 km']], p.warnKm))
    + set('En la pantalla de inicio', '', `<div class="gc">${sw('showNd', 'Recordar tareas sin «última vez»', 'Muestra cuántas faltan por completar', p.showNd)}</div>`)
    + set('Calendario', 'Una app web no puede avisarte con fiabilidad estando cerrada. Exporta los vencimientos a tu calendario y él te avisará. Repite la exportación cuando cambien: los avisos se actualizan, no se duplican.',
      `<div class="lrs">${lr('ics', 'cal', 'Añadir avisos a mi calendario', 'Archivo .ics con vencimientos y caducidades')}</div>`);
  el.querySelector('#ics').onclick = exportICS;
}

/* ---------- Viajes ---------- */
function viajesSec(el) {
  const p = prefs();
  const pl = D.places.slice().sort((a, b) => a.label.localeCompare(b.label));
  el.innerHTML = set('Ritmo en ruta', 'Una autocaravana va más despacio que un turismo. El tiempo de cada ruta se multiplica por este valor.', seg('timeFactor', [[1.1, '+10 %'], [1.2, '+20 %'], [1.3, '+30 %'], [1.4, '+40 %']], p.timeFactor) + `<p class="hint" style="margin:8px 2px 0">Para un ${esc(PERFIL.nombre)} recomiendo +30 %.</p>`)
    + set('Nuevas paradas', 'Tipo que se pone al añadir una parada.', `<select class="selp" id="defStop" aria-label="Tipo de parada por defecto">${STOP_TIPOS.map(([k, l]) => `<option value="${k}" ${p.defStop === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)
    + set('Mapa', '', `<div class="gc">${sw('mapGray', 'Mapa en blanco y negro', 'Como en Rutahz: la ruta destaca más', p.mapGray)}</div>`)
    + set('Mis lugares', pl.length ? `${pl.length} ${pl.length === 1 ? 'lugar guardado' : 'lugares guardados'}. Se guardan con la ★ de cada parada.` : 'Aún no has guardado ninguno: usa la ★ de una parada.',
      pl.length ? `<div class="gc">${pl.map(x => `<div class="row"><div><b>${esc(x.label)}</b><small>${esc((STOP_TIPOS.find(t => t[0] === x.tipo) || [, 'Visita'])[1])}</small></div><button class="gb" data-ren="${x.id}" aria-label="Renombrar">${icon('edit')}</button><button class="gb dg" data-del="${x.id}" aria-label="Eliminar">${icon('trash')}</button></div>`).join('')}</div>` : '');
  el.querySelector('#defStop').onchange = async e => { await savePrefs({ defStop: e.target.value }); toast('Guardado'); };
  el.querySelectorAll('[data-del]').forEach(b => (b.onclick = async () => { const x = D.places.find(p => p.id === b.dataset.del); await del('places', x.id); viajesSec(el); undo('Lugar eliminado', async () => { await put('places', x); viajesSec(el); }); }));
  el.querySelectorAll('[data-ren]').forEach(b => (b.onclick = () => renamePlace(D.places.find(p => p.id === b.dataset.ren), () => viajesSec(el))));
}
function renamePlace(x, done) {
  const F = [{ k: 'label', l: 'Nombre', req: 'El lugar necesita un nombre', minLen: 2, maxLen: 60, full: 1,
    check: v => D.places.some(p => p.id !== x.id && normKey(p.label) === normKey(v)) ? 'Ya tienes un lugar con ese nombre' : null },
    { k: 'tipo', l: 'Tipo', t: 'select', o: STOP_TIPOS }];
  sheet({ title: 'Editar lugar', body: form(F, x), foot: `<button class="btn" data-save>${icon('check')}Guardar</button>`,
    onMount: s => onSubmit(s, F, null, async v => { await put('places', { ...x, ...v }); await s.close(); toast('Lugar guardado'); done(); }) });
}

/* ---------- Copia de seguridad ---------- */
function copia(el) {
  const lb = getKV('lastBackup', 0), p = prefs(), n = STORES.reduce((s, k) => s + D[k].length, 0);
  el.innerHTML = set('Copia completa', `Incluye vehículo, plan e historial, viajes, lugares, gastos, documentos y ajustes (${n} registros). <b>${lb ? 'Última copia: ' + ago(lb) : 'Aún no has hecho ninguna.'}</b>`,
      `<div class="lrs">${lr('bx', 'dl', 'Descargar copia de seguridad', 'Guárdala fuera del móvil: en la nube o en el ordenador')}
      <label class="lr" for="bi">${icon('ul')}<div><b>Restaurar copia</b><small>Sustituye todos los datos por los del archivo</small></div>${icon('right', 'chev')}<input type="file" id="bi" accept=".json,application/json" hidden></label></div>`)
    + set('Recordatorio', '', `<div class="gc">${sw('bkRemind', 'Recordarme hacer copia', 'Aviso en Inicio si pasan 30 días sin copia', p.bkRemind)}</div>`)
    + set('Exportar', 'Para abrir en otras aplicaciones.', `<div class="lrs">${lr('csv', 'doc', 'Gastos en CSV', 'Para Excel o Google Sheets')}${lr('ics', 'cal', 'Avisos en calendario (.ics)', 'Vencimientos y caducidades')}</div>`);
  el.querySelector('#bx').onclick = async () => { await backupJSON(); copia(el); };
  el.querySelector('#bi').onchange = importJSON;
  el.querySelector('#csv').onclick = exportCSV;
  el.querySelector('#ics').onclick = exportICS;
}

/* ---------- Avanzado ---------- */
function instalar() {
  if (isApp()) return set('Instalar la app', 'Ya la estás usando instalada. Se abre desde su icono y funciona sin conexión (salvo el mapa y las rutas).', '');
  if (canPrompt()) return set('Instalar la app', 'Ábrela como una app más: desde su icono, a pantalla completa y sin conexión.', `<div class="lrs">${lr('insb', 'dl', 'Instalar Caravanahz', 'Se añade a tu pantalla de inicio')}</div>`);
  if (isIOS()) return set('Instalar la app', 'En iPhone y iPad se instala desde el navegador:', `<ol class="steps"><li>Pulsa <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Abre Caravanahz desde el icono nuevo.</li></ol>`);
  if (installed()) return set('Instalar la app', 'Ya está instalada en este dispositivo. Ábrela desde su icono para usarla a pantalla completa.', '');
  return set('Instalar la app', 'Abre esta página con Chrome o Edge en el móvil y aparecerá la opción de instalar. Si no sale, busca «Instalar app» o «Añadir a pantalla de inicio» en el menú ⋮ del navegador.', '');
}

function avanzado(el) {
  el.innerHTML = instalar() + set('Almacenamiento', 'Los datos viven solo en este navegador.', `<div class="gc" id="stg"><div class="row"><div><small>Calculando…</small></div></div></div>`)
    + set('Restablecer', 'Estas acciones no se pueden deshacer.', `<div class="lrs">
      ${lr('rp', 'cog', 'Restablecer ajustes', 'Tema, color, texto y avisos a sus valores iniciales. No toca tus datos.')}
      ${lr('rst', 'trash', 'Borrar todos los datos', 'Vuelve al estado de la primera visita', 'dg')}</div>`)
    + `<div class="abt"><div class="logo" role="img" aria-label="Caravanahz"><svg class="lgi" viewBox="0 0 64 64" aria-hidden="true"><use href="#logo-mark"/></svg><span class="lw" aria-hidden="true">caravana<em>hz</em></span><svg class="lp" viewBox="0 0 44 24" aria-hidden="true"><path d="M1 13H13L17 2L23 21L27 8L30 13H43"/></svg></div>
      <span>Diseñado y creado por <strong>Krahz</strong></span><p class="hint">Versión ${VER} · Mapas © Esri y OpenStreetMap · Rutas © OSRM · Búsqueda © Nominatim</p></div>`;
  (async () => {
    const rows = [];
    try { const e = await navigator.storage.estimate(); rows.push(['Espacio usado', e.usage < 1048576 ? Math.max(1, Math.round(e.usage / 1024)) + ' KB' : (e.usage / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' MB']); } catch (x) {}
    try { const p = await navigator.storage.persisted(); rows.push(['Protección contra borrado automático', p ? 'Activada' : 'No concedida por el navegador (instala la app para mejorarlo)']); } catch (x) {}
    const NOM = { tasks: ['tarea', 'tareas'], services: ['mantenimiento', 'mantenimientos'], docs: ['documento', 'documentos'], expenses: ['gasto', 'gastos'], trips: ['viaje', 'viajes'], places: ['lugar', 'lugares'], odo: ['lectura de km', 'lecturas de km'] };
    rows.push(['Registros', STORES.filter(k => D[k].length).map(k => `${D[k].length} ${NOM[k][D[k].length === 1 ? 0 : 1]}`).join(' · ') || 'Ninguno']);
    const g = el.querySelector('#stg'); if (g) g.innerHTML = rows.map(([a, b]) => `<div class="row"><div><small>${a}</small><b style="white-space:normal">${esc(b)}</b></div></div>`).join('');
  })();
  const ib = el.querySelector('#insb'); if (ib) ib.onclick = async () => { await install(); avanzado(el); };
  el.querySelector('#rp').onclick = async () => {
    if (!confirm('¿Volver a los ajustes iniciales (tema, color, texto, avisos y rutas)?')) return;
    await setKV('prefs', {}); await savePrefs({ ...PREF_DEFAULTS, ah: undefined, as: undefined }); toast('Ajustes restablecidos'); avanzado(el);
  };
  el.querySelector('#rst').onclick = async () => {
    if (!confirm('Se borrarán el vehículo, el plan, el historial, los viajes, los gastos y los documentos de este dispositivo. No se puede deshacer.\n\nSi quieres conservarlos, cancela y haz antes una copia de seguridad.\n\n¿Borrar todo?')) return;
    if (prompt('Para confirmar, escribe BORRAR') !== 'BORRAR') return toast('Cancelado: no se ha borrado nada');
    await wipe(); try { localStorage.removeItem('cz_pf'); } catch (e) {}
    location.hash = '#/inicio'; location.reload();
  };
}

/* ---------- Copias y exportaciones (también se usan desde Inicio) ---------- */
export async function backupJSON() {
  const j = { app: 'caravanahz', v: 1, exported: new Date().toISOString(), data: dump() };
  download(`caravanahz-copia-${isoToday()}.json`, JSON.stringify(j), 'application/json');
  await setKV('lastBackup', Date.now());
  toast('Copia descargada: guárdala fuera del móvil');
}

/* Validación de la copia: solo entran objetos con forma conocida */
const isS = (x, n = 5000) => typeof x === 'string' && x.length <= n;
function clean(j) {
  if (!j || j.app !== 'caravanahz' || !j.data || typeof j.data !== 'object') return null;
  const d = j.data, out = { kv: {} };
  const bad = new Set(['__proto__', 'constructor', 'prototype']);
  const obj = o => o && typeof o === 'object' && !Array.isArray(o) && isS(o.id, 60) && !bad.has(o.id);
  const scrub = o => JSON.parse(JSON.stringify(o, (k, val) => (bad.has(k) ? undefined : typeof val === 'string' ? val.slice(0, 5000) : val)));
  for (const s of STORES) out[s] = (Array.isArray(d[s]) ? d[s] : []).filter(obj).slice(0, 20000).map(scrub);
  if (d.kv && typeof d.kv === 'object') for (const [k, val] of Object.entries(d.kv)) if (isS(k, 40) && !bad.has(k)) out.kv[k] = scrub(val);
  out.places = out.places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && isS(p.label, 200));
  out.trips = out.trips.filter(t => isS(t.nombre, 200));
  out.trips.forEach(t => (t.paradas = (Array.isArray(t.paradas) ? t.paradas : []).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))));
  out.tasks = out.tasks.filter(t => isS(t.nombre, 200));
  out.expenses = out.expenses.filter(e => isS(e.fecha, 10) && Number.isFinite(+e.importe));
  out.docs = out.docs.filter(x => isS(x.tipo, 60));
  return { out, date: new Date(j.exported) };
}
async function importJSON(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 3e7) return toast('Archivo demasiado grande');
  let j; try { j = JSON.parse(await f.text()); } catch (x) { return toast('El archivo no es una copia válida'); }
  const r = clean(j); if (!r) return toast('No es una copia de Caravanahz');
  const o = r.out;
  if (!confirm(`Copia del ${isNaN(r.date) ? '¿?' : r.date.toLocaleDateString('es-ES')}:\n• ${o.tasks.length} tareas y ${o.services.length} registros de mantenimiento\n• ${o.trips.length} viajes\n• ${o.expenses.length} gastos y ${o.docs.length} documentos\n\nSe SUSTITUYEN todos los datos actuales. ¿Continuar?`)) return;
  await restore(o);
  await savePrefs({}); toast('Copia restaurada'); go('inicio');
}

function exportICS() {
  const c = ctx(), ev = [];
  tasksWithStatus(c).forEach(({ t, s }) => {
    if (!s.when) return;
    ev.push({ uid: 't-' + t.id, date: s.when < c.today ? c.today : s.when, title: `🔧 ${t.nombre}`, desc: `Mantenimiento de la autocaravana.${s.dueKm ? ` También vence a los ${s.dueKm} km.` : ''}${s.projDate && s.projDate === s.when ? ' Fecha estimada por tu ritmo de uso.' : ''}`, alarmDays: 7 });
  });
  docsWithStatus(c).forEach(({ d }) => { if (d.vence) ev.push({ uid: 'd-' + d.id, date: d.vence, title: `📄 Caduca: ${d.tipo}${d.nombre ? ' (' + d.nombre + ')' : ''}`, desc: d.ref ? 'Ref.: ' + d.ref : 'Documento de la autocaravana', alarmDays: Math.max(1, +d.avisoDias || 30) }); });
  if (!ev.length) return toast('No hay vencimientos con fecha para exportar');
  download(`caravanahz-avisos-${isoToday()}.ics`, buildICS(ev), 'text/calendar;charset=utf-8');
  toast(`${ev.length} avisos exportados: ábrelo para añadirlos al calendario`);
}
