// Formularios reutilizados desde varias pantallas: kilómetros, gastos, mantenimiento, documentos y vehículo.
// Todas las comprobaciones viven aquí, junto a cada formulario.
import { D, put, del, uid, setKV } from './db.js';
import { sheet, form, toast, undo, fKm, fDate, fNum, fPpl, fEur, icon, esc, ask, isSimple } from './ui.js';
import { isoToday, currentKm, kmPoints, tripOn, kmCheck, addMonths, addDays, lastFuelPrice } from './logic.js';
import { CATS, CAT_ICO, CAT_EJ, ZONAS, DOC_TIPOS, vehicle } from './store.js';
import { PERFIL, ITV_CAT, itvMeses } from './perfil.js';
import { refresh } from './router.js';
import { onSubmit, normKey, R, KM_MAX, normPlate, checkPlate, parseNum } from './valid.js';

const actions = (save, delLabel) => `${delLabel ? `<button class="btn d" data-del>${icon('trash')}${delLabel}</button>` : ''}<button class="btn" data-save>${icon('check')}${save}</button>`;
const fechaMat = () => vehicle().fechaMat || '';

/** Mensaje si el dato del cuentakilómetros no es creíble */
export function kmMsg(fecha, km, ignoreId) {
  const c = kmCheck(D, fecha, km, ignoreId);
  if (!c) return null;
  if (c.tipo === 'baja') return c.ref.fecha <= fecha
    ? `El cuentakilómetros no puede bajar: el ${fDate(c.ref.fecha)} ya marcaba ${fKm(c.ref.km)}`
    : `No cuadra: el ${fDate(c.ref.fecha)}, después de esta fecha, marcaba solo ${fKm(c.ref.km)}`;
  if (c.ref.aprox) return `No cuadra con tu cuentakilómetros: al configurar la autocaravana el ${fDate(c.ref.fecha)} pusiste ${fKm(c.ref.km)}. Si eran aproximados, corrígelos en Ajustes → Vehículo.`;
  return `Son ${fKm(Math.abs(km - c.ref.km))} en ${c.dias} ${c.dias === 1 ? 'día' : 'días'} respecto al ${fDate(c.ref.fecha)} (${fKm(c.ref.km)}). ¿Sobra o falta una cifra?`;
}
/** Fecha válida para registros del vehículo: no futura y no anterior a su matriculación */
const pastDate = (extra = {}) => ({ t: 'date', past: true, quick: true, minDate: () => fechaMat() || '1950-01-01', ...extra });
/** Valores ya usados (los más frecuentes primero) para autocompletar */
const used = (list, key) => { const n = {}; list.forEach(x => { const v = (x[key] || '').trim(); if (v) n[v] = (n[v] || 0) + 1; }); return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 40); };

/* ---------- Actualizar kilómetros ---------- */
export function odoSheet() {
  const cur = currentKm(D);
  const F = [
    { k: 'fecha', l: 'Fecha', ...pastDate({ req: 'Indica la fecha' }) },
    { k: 'km', l: 'Kilómetros del cuentakilómetros', t: 'number', step: 1, req: 'Indica los kilómetros', ...R.km, min: 1, help: cur ? 'Último dato: ' + fKm(cur) : '' },
  ];
  sheet({
    title: 'Actualizar kilómetros', body: form(F, { fecha: isoToday() }), foot: actions('Guardar'),
    onMount: s => onSubmit(s, F, v => [{ k: 'km', msg: kmMsg(v.fecha, v.km) }],
      async v => {
        if (D.odo.some(o => o.fecha === v.fecha && +o.km === v.km)) return 'Ese dato ya estaba registrado.';
        await put('odo', { fecha: v.fecha, km: v.km });
        await s.close(); toast('Kilómetros actualizados'); refresh();
      })
  });
}

/* ---------- Borrar gastos (desde la lista, la hoja o al borrar un viaje) ---------- */
/** Borra los gastos y devuelve la función que los recupera (con el mantenimiento al que estaban ligados) */
export async function removeExpenses(list) {
  const olds = list.map(e => ({ ...e })), svs = [];
  for (const e of list) {
    await del('expenses', e.id);
    const sv = e.servicioId && D.services.find(x => x.id === e.servicioId);
    if (sv) { svs.push({ ...sv }); await put('services', { ...sv, coste: '', gastoId: '' }); }
  }
  return async () => { for (const o of olds) await put('expenses', o); for (const sv of svs) await put('services', sv); };
}
/** Papelera de un gasto: pregunta (con el importe) y deja deshacer */
export async function askDeleteExpense(e, after) {
  if (!e) return;
  const ok = await ask({ title: '¿Borrar este gasto?', text: `${e.concepto || e.cat} · ${fEur(e.importe)} · ${fDate(e.fecha)}${e.servicioId ? '\nEstá ligado a un mantenimiento: el mantenimiento se queda sin coste.' : ''}`, ok: 'Sí, borrar', cancel: 'No', danger: true });
  if (!ok) return;
  const restore = await removeExpenses([e]);
  after && after();
  undo('Gasto borrado', async () => { await restore(); after && after(); });
}

/* ---------- Gasto (incluye repostajes) ---------- */
export function expenseSheet(e = {}, preset = {}) {
  const isNew = !e.id; e = { fecha: isoToday(), cat: 'Combustible', lleno: true, ...preset, ...e };
  // De viaje: un gasto nuevo se apunta en el viaje de esa fecha (sin tener que abrir «Más datos»)
  const auto = isNew && !('viajeId' in preset);
  if (auto) { const t = tripOn(D.trips, e.fecha); if (t) e.viajeId = t.id; }
  const dep = +vehicle().deposito || 0;
  const trips = [['', '— Ninguno —'], ...D.trips.slice().sort((a, b) => (b.inicio || '').localeCompare(a.inicio || '')).map(t => [t.id, t.nombre + (t.inicio ? ' · ' + fDate(t.inicio, { month: 'short', year: 'numeric' }) : '')])];
  const lastP = lastFuelPrice(D.expenses);
  if (e.cat === 'Combustible' && +e.litros > 0 && +e.importe > 0 && !e.ppl) e.ppl = Math.round(e.importe / e.litros * 1000) / 1000;
  const F = [
    { k: 'fecha', l: 'Fecha', ...pastDate({ req: 'Indica la fecha' }) },
    { k: 'cat', l: 'Categoría', t: 'select', o: CATS, req: true },
    { k: 'litros', l: 'Litros', t: 'number', fuel: 1, min: 1, max: dep ? Math.ceil(dep * 1.1) : 300, dec: 2, help: dep ? `Tu depósito: ${dep} L` : '' },
    { k: 'ppl', l: 'Precio por litro (€)', t: 'number', fuel: 1, dec: 3, check: v => (v < 0.7 || v > 3.5 ? `${fPpl(v)} €/L no es un precio normal de gasóleo: revisa los litros o el importe` : null), help: lastP ? `La última vez: ${fPpl(lastP)} € el litro` : 'Lo pone en el surtidor o en el ticket' },
    { k: 'importe', l: 'Total pagado (€)', t: 'number', req: 'Indica cuánto has pagado', ...R.money(50000), help: 'Si pones los litros y el precio, se calcula solo' },
    { k: 'km', l: 'Kilómetros del cuentakilómetros', t: 'number', int: true, ...R.km, help: 'Los que marca el salpicadero. Sirven para saber cuánto gastas' },
    { k: 'lleno', l: 'He llenado el depósito', t: 'switch', help: 'Déjalo marcado si has llenado hasta arriba. Así se calcula bien cuánto gasta', fuel: 1 },
    { k: 'concepto', l: 'Concepto', ph: 'Ej. Repsol Lleida, peaje AP-7…', maxLen: 80, sug: used(D.expenses.filter(x => x.cat === e.cat), 'concepto') },
    { k: 'viajeId', adv: 1, l: 'Viaje', t: 'select', o: trips },
    { k: 'notas', adv: 1, l: 'Notas', t: 'textarea', maxLen: 1000 },
  ];
  sheet({
    title: isNew ? (e.cat === 'Combustible' ? 'Nuevo repostaje' : 'Nuevo gasto') : 'Editar gasto', body: form(F, e), foot: actions('Guardar', isNew ? '' : 'Eliminar'),
    onMount: s => {
      const cat = s.el.querySelector('[name=cat]'), conc = s.el.querySelector('[name=concepto]');
      const sync = () => {
        const fuel = cat.value === 'Combustible';
        F.filter(f => f.fuel).forEach(f => { const n = s.el.querySelector(`[name=${f.k}]`); (n.closest('.fld') || n.closest('.swr')).hidden = !fuel; });
        conc.placeholder = CAT_EJ[cat.value] || '';
        // La ayuda del importe («se calcula solo con litros y precio») solo vale para el gasóleo
        const ih = s.el.querySelector('[name=importe]').closest('.fld').querySelector('small:not(.er)'); if (ih) ih.hidden = !fuel;
        s.el.querySelectorAll('.catp [data-c]').forEach(b => { const on = b.dataset.c === cat.value; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
        let dl = s.el.querySelector('#dl-concepto');
        if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-concepto'; conc.after(dl); conc.setAttribute('list', 'dl-concepto'); }
        dl.innerHTML = used(D.expenses.filter(x => x.cat === cat.value), 'concepto').map(o => `<option value="${esc(o)}">`).join('');
        s.el.querySelector('h2').textContent = isNew ? (fuel ? 'Nuevo repostaje' : 'Nuevo gasto') : 'Editar gasto';
      };
      // Categorías a la vista como botones (el desplegable escondía Equipamiento, Ferry u Otros)
      cat.closest('.fld').classList.add('catf');
      cat.insertAdjacentHTML('afterend', `<div class="catp" role="radiogroup" aria-label="Categoría">${CATS.map(c => `<button type="button" role="radio" data-c="${esc(c)}">${icon(CAT_ICO[c] || 'euro')}<span>${esc(c)}</span></button>`).join('')}</div>`);
      s.el.querySelector('.catp').addEventListener('click', ev => { const b = ev.target.closest('[data-c]'); if (!b || cat.value === b.dataset.c) return; cat.value = b.dataset.c; cat.dispatchEvent(new Event('change', { bubbles: true })); });
      cat.onchange = sync; sync();
      fuelCalc(s.el);
      // Aviso visible de a qué viaje va el gasto; si cambias la fecha, se recalcula (salvo que hayas elegido tú el viaje)
      const vSel = s.el.querySelector('[name=viajeId]'), fIn = s.el.querySelector('[name=fecha]');
      s.body.insertAdjacentHTML('afterbegin', '<p class="fm" data-trip hidden style="margin-bottom:12px"></p>');
      const tNote = s.el.querySelector('[data-trip]');
      let mine = !auto;
      const showTrip = () => { const t = vSel.value && D.trips.find(x => x.id === vSel.value); tNote.hidden = !t; if (t) tNote.innerHTML = `${icon('map')} Se apunta en el viaje <b>${esc(t.nombre)}</b>. ${isNew ? 'Para cambiarlo, abre «Más datos».' : ''}`; };
      vSel.addEventListener('change', () => { mine = true; showTrip(); });
      fIn.addEventListener('change', () => { if (mine || !/^\d{4}-\d\d-\d\d$/.test(fIn.value)) return; const t = tripOn(D.trips, fIn.value); vSel.value = t ? t.id : ''; showTrip(); });
      showTrip();
      if (e.servicioId) s.body.insertAdjacentHTML('afterbegin', `<p class="fm" style="margin-bottom:12px">Este gasto está vinculado a un mantenimiento. Si lo borras, el mantenimiento se queda sin coste.</p>`);
      onSubmit(s, F, v => {
        const er = [];
        if (v.km) er.push({ k: 'km', msg: kmMsg(v.fecha, v.km, e.id) });
        if (v.cat === 'Combustible' && v.litros) {
          const ppl = v.importe / v.litros;
          if (ppl < 0.7 || ppl > 3.5) er.push({ k: 'importe', msg: `Sale a ${fPpl(ppl)} €/L: revisa el importe o los litros` });
          else if (v.ppl && Math.abs(v.ppl * v.litros - v.importe) > Math.max(0.05, v.importe * 0.01)) er.push({ k: 'importe', msg: `${fNum(v.litros, 2)} L a ${fPpl(v.ppl)} €/L son ${fNum(v.litros * v.ppl, 2)} €, no ${fNum(v.importe, 2)} €` });
          if (v.lleno && !v.km) er.push({ k: 'km', msg: 'Para calcular el consumo de un lleno necesito los km. Si no los sabes, desmarca «He llenado el depósito».' });
        }
        if (v.cat === 'Combustible' && !v.litros && v.lleno) er.push({ k: 'litros', msg: 'Indica los litros o desmarca «He llenado el depósito»' });
        if (v.viajeId) { const t = D.trips.find(x => x.id === v.viajeId); if (t && t.inicio && v.fecha < addDays(t.inicio, -60)) er.push({ k: 'viajeId', adv: 1, msg: `El viaje empieza el ${fDate(t.inicio)}: ¿es el viaje correcto?` }); }
        return er;
      }, async v => {
        if (isNew && D.expenses.some(x => x.fecha === v.fecha && x.cat === v.cat && +x.importe === v.importe && normKey(x.concepto) === normKey(v.concepto)))
          if (!(await ask({ title: '¿Guardar otra vez?', text: 'Ya hay un gasto igual: misma fecha, tipo e importe.', ok: 'Sí, guardarlo', cancel: 'No' }))) return '';
        const rec = { ...e, ...v }; delete rec.ppl;
        await put('expenses', rec);
        if (e.servicioId) { const sv = D.services.find(x => x.id === e.servicioId); if (sv && +sv.coste !== v.importe) await put('services', { ...sv, coste: v.importe }); }
        await s.close(); toast(isNew ? 'Gasto guardado' : 'Gasto actualizado'); refresh();
      });
      const d = s.el.querySelector('[data-del]');
      if (d) d.onclick = async () => {
        const restore = await removeExpenses([D.expenses.find(x => x.id === e.id) || e]);
        await s.close(); refresh();
        undo('Gasto borrado', async () => { await restore(); refresh(); });
      };
    }
  });
}

/**
 * Litros × precio = importe: con dos de los tres, calcula el tercero mientras escribes.
 * El campo calculado se marca y deja de calcularse en cuanto lo editas tú.
 */
function fuelCalc(el) {
  const L = el.querySelector('[name=litros]'), P = el.querySelector('[name=ppl]'), I = el.querySelector('[name=importe]');
  const num = i => { const v = parseNum(i.value, false, i === I); return typeof v === 'number' && v > 0 ? v : null; };
  const fill = (i, v, d) => { i.value = v.toFixed(d).replace('.', ','); i.dataset.auto = '1'; i.closest('.fld').classList.add('auto'); };
  const own = i => { delete i.dataset.auto; i.closest('.fld').classList.remove('auto'); };
  [L, P, I].forEach(i => i.addEventListener('input', () => {
    own(i);
    const l = num(L), p = num(P), t = num(I);
    if (i !== I && l && p && (!t || I.dataset.auto)) fill(I, l * p, 2);
    else if (i !== P && l && t && (!p || P.dataset.auto)) fill(P, t / l, 3);
    else if (i !== L && p && t && (!l || L.dataset.auto)) fill(L, t / p, 2);
  }));
}

/* ---------- Registrar un mantenimiento hecho (de una tarea del plan o suelto) ---------- */
export function serviceSheet(task = null, sv = {}) {
  const isNew = !sv.id;
  sv = { fecha: isoToday(), km: currentKm(D) || '', crearGasto: true, nombre: task ? task.nombre : '', zona: task ? task.zona : 'Otros', ...sv };
  const F = [
    ...(task ? [] : [{ k: 'nombre', l: 'Qué se ha hecho', full: 1, ph: 'Ej. Cambio de bomba de agua', req: 'Indica qué se ha hecho', minLen: 3, maxLen: 80 }, { k: 'zona', l: 'Zona', t: 'select', o: ZONAS, req: true }]),
    { k: 'fecha', l: 'Fecha', ...pastDate({ req: 'Indica la fecha' }) },
    { k: 'km', l: 'Kilómetros', t: 'number', step: 1, ...R.km, req: task && +task.intKm ? 'Esta tarea va por km: indica los km' : false },
    { k: 'coste', l: 'Coste (€)', t: 'number', step: 0.01, min: 0, max: 100000, dec: 2, thou: true, help: 'Opcional' },
    { k: 'taller', l: 'Taller o «Yo mismo»', ph: 'Ej. Taller Pérez', maxLen: 60, sug: used(D.services, 'taller') },
    ...(isNew ? [{ k: 'crearGasto', adv: 1, l: 'Añadir también a gastos', t: 'switch', help: 'Si indicas coste, se crea el gasto en «Mantenimiento»' }] : []),
    { k: 'notas', adv: 1, l: 'Notas', t: 'textarea', ph: 'Piezas, referencias, aceite usado…', maxLen: 2000 },
  ];
  sheet({
    title: task ? task.nombre : isNew ? 'Registrar reparación' : 'Editar registro',
    body: (task && isNew ? `<p class="hint" style="margin-bottom:12px">Se apunta como hecho y el plan vuelve a contar desde esta fecha y estos kilómetros.</p>` : '') + form(F, sv),
    foot: actions(isNew && task ? 'Marcar como hecho' : 'Guardar', isNew ? '' : 'Eliminar'),
    onMount: s => {
      onSubmit(s, F, v => {
        const er = [];
        if (v.km) er.push({ k: 'km', msg: kmMsg(v.fecha, v.km, sv.id) });
        if (task && D.services.some(x => x.id !== sv.id && x.tareaId === task.id && x.fecha === v.fecha)) er.push({ k: 'fecha', msg: 'Ya hay un registro de esta tarea en esa fecha' });
        if (v.crearGasto && v.coste === 0) er.push({ k: 'coste', msg: 'Con coste 0 no se crea gasto: déjalo vacío o desmarca la opción' });
        return er;
      }, async v => {
        const rec = { ...sv, ...v, tareaId: task ? task.id : sv.tareaId || '' };
        if (task) { rec.nombre = task.nombre; rec.zona = task.zona; }
        delete rec.crearGasto;
        if (!rec.id) rec.id = uid();
        if (isNew && v.crearGasto && v.coste > 0) {
          const g = await put('expenses', { fecha: v.fecha, cat: 'Mantenimiento', importe: v.coste, concepto: rec.nombre + (v.taller ? ' · ' + v.taller : ''), km: v.km, servicioId: rec.id });
          rec.gastoId = g.id;
        } else if (!isNew && rec.gastoId) {
          const g = D.expenses.find(x => x.id === rec.gastoId);
          if (g) { if (v.coste > 0) await put('expenses', { ...g, importe: v.coste, fecha: v.fecha, km: v.km }); else { await del('expenses', g.id); rec.gastoId = ''; } }
        }
        await put('services', rec);
        if (rec.tareaId) await syncTaskLast(rec.tareaId);
        await s.close(); toast(isNew ? 'Mantenimiento registrado' : 'Registro actualizado'); refresh();
      });
      const d = s.el.querySelector('[data-del]');
      if (d) d.onclick = async () => {
        if (!(await ask({ title: '¿Borrar este registro?', text: sv.gastoId ? 'También se borrará su gasto.' : '', ok: 'Sí, borrar', cancel: 'No', danger: true }))) return;
        if (sv.gastoId) await del('expenses', sv.gastoId);
        await del('services', sv.id);
        if (sv.tareaId) await syncTaskLast(sv.tareaId);
        await s.close(); toast('Registro eliminado'); refresh();
      };
    }
  });
}

/** La «última vez» de una tarea es el registro más reciente de su historial (o lo que el usuario indicó a mano) */
export async function syncTaskLast(taskId) {
  const t = D.tasks.find(x => x.id === taskId); if (!t) return;
  const h = D.services.filter(x => x.tareaId === taskId).sort((a, b) => b.fecha.localeCompare(a.fecha) || (+b.km || 0) - (+a.km || 0));
  if (h.length) await put('tasks', { ...t, ultFecha: h[0].fecha, ultKm: h[0].km === '' || h[0].km == null ? '' : h[0].km });
  else await put('tasks', { ...t, ultFecha: t.manFecha ?? '', ultKm: t.manKm ?? '' });
}

/* ---------- Tarea del plan ---------- */
export function taskSheet(t = {}) {
  const isNew = !t.id;
  t = { zona: 'Motor', intMeses: 12, intKm: '', ...t };
  const hasHist = !isNew && D.services.some(x => x.tareaId === t.id);
  const cur = currentKm(D);
  const F = [
    { k: 'nombre', l: 'Nombre', full: 1, ph: 'Ej. Aceite y filtro', req: 'Pon un nombre a la tarea', minLen: 3, maxLen: 60,
      check: v => D.tasks.some(x => x.id !== t.id && normKey(x.nombre) === normKey(v)) ? 'Ya tienes una tarea con ese nombre' : null },
    { k: 'zona', adv: 1, l: 'Zona', t: 'select', o: ZONAS, req: true },
    { k: 'intMeses', l: 'Cada (meses)', t: 'number', step: 1, int: true, min: 0, max: 240, help: 'Vacío o 0 = sin límite de tiempo' },
    { k: 'intKm', l: 'Cada (km)', t: 'number', step: 500, int: true, min: 0, max: 500000, help: 'Vacío o 0 = sin límite de km' },
    ...(hasHist ? [] : [{ t: 'section', l: 'Última vez que se hizo' }, { k: 'ultFecha', l: 'Fecha', ...pastDate({ quick: false }) },
      { k: 'ultKm', l: 'Kilómetros', t: 'number', step: 1, ...R.km, max: cur || KM_MAX, help: cur ? 'Como mucho ' + fKm(cur) + ' (los actuales)' : '' }]),
    { k: 'notas', adv: 1, l: 'Notas', t: 'textarea', ph: 'Referencia de pieza, tipo de aceite, intervalo del manual…', maxLen: 2000 },
  ];
  sheet({
    title: isNew ? 'Nueva tarea' : 'Editar tarea',
    body: (hasHist ? '<p class="hint" style="margin-bottom:12px">La última vez se toma del historial de esta tarea.</p>' : '') + form(F, t),
    foot: actions('Guardar', isNew ? '' : 'Eliminar'),
    onMount: s => {
      onSubmit(s, F, v => {
        if (!(v.intMeses > 0) && !(v.intKm > 0)) return [{ k: 'intMeses', msg: 'Indica cada cuántos meses, cada cuántos km, o ambos' }];
        if (!hasHist && v.intKm > 0 && v.ultFecha && v.ultKm === '') return [{ k: 'ultKm', msg: 'Esta tarea va por km: indica los km de esa vez' }];
        if (!hasHist && v.intMeses > 0 && v.ultKm !== '' && !v.ultFecha) return [{ k: 'ultFecha', msg: 'Esta tarea va por tiempo: indica la fecha' }];
        return [];
      }, async v => {
        const rec = { ...t, ...v, intMeses: v.intMeses || 0, intKm: v.intKm || 0 };
        if (!hasHist) { rec.manFecha = v.ultFecha; rec.manKm = v.ultKm; }
        await put('tasks', rec);
        await s.close(); toast(isNew ? 'Tarea añadida' : 'Tarea actualizada'); refresh();
      });
      const d = s.el.querySelector('[data-del]');
      if (d) d.onclick = async () => {
        const n = D.services.filter(x => x.tareaId === t.id).length;
        if (!(await ask({ title: `¿Quitar «${t.nombre}» del plan?`, text: n ? `Sus ${n} registros se conservan en el historial.` : 'Dejará de avisarte de esta tarea.', ok: 'Sí, quitar', cancel: 'No', danger: true }))) return;
        const old = { ...t }; await del('tasks', t.id); await s.close(); refresh();
        undo('Tarea eliminada', async () => { await put('tasks', old); refresh(); });
      };
    }
  });
}

/* ---------- Documento ---------- */
const docKey = d => [d.tipo, normKey(d.nombre), d.vence].join('|');
export function docSheet(d = {}) {
  const isNew = !d.id;
  d = { tipo: 'ITV', avisoDias: 30, ...d };
  const F = [
    { k: 'tipo', l: 'Tipo', t: 'select', o: DOC_TIPOS, req: true },
    { k: 'nombre', l: 'Compañía o detalle', ph: 'Ej. Mapfre, Estación ITV…', maxLen: 60 },
    { k: 'vence', l: 'Caduca el', t: 'date', req: 'Indica la fecha de caducidad', minDate: '2000-01-01', maxDate: () => addMonths(isoToday(), 12 * 20) },
    { k: 'avisoDias', adv: 1, l: 'Avisar con (días)', t: 'number', step: 1, int: true, min: 0, max: 365, req: 'Indica con cuántos días avisar' },
    { k: 'importe', l: 'Importe (€)', t: 'number', step: 0.01, min: 0, max: 20000, dec: 2, thou: true, help: 'Para el aviso de renovación' },
    { k: 'ref', adv: 1, l: 'Nº de póliza / referencia', ph: 'Opcional', maxLen: 40 },
    { k: 'tel', l: 'Teléfono de asistencia', t: 'tel', ph: 'Opcional', pattern: [/^\+?[0-9 ()-]{6,20}$/, 'Teléfono no válido (solo números, espacios y +)'] },
    { k: 'notas', adv: 1, l: 'Notas', t: 'textarea', maxLen: 2000 },
  ];
  sheet({
    title: isNew ? 'Nuevo documento' : d.tipo, body: form(F, d),
    foot: (!isNew && d.tel ? `<a class="btn g" href="tel:${esc(String(d.tel).replace(/[^+0-9]/g, ''))}">${icon('phone')}Llamar</a>` : '') + (isNew ? '' : `<button class="btn g" data-ren>${icon('cal')}Renovar</button>`) + actions('Guardar', isNew ? '' : 'Eliminar'),
    onMount: s => {
      onSubmit(s, F, v => {
        const er = [];
        if (v.tipo === 'Otro' && !v.nombre) er.push({ k: 'nombre', msg: 'Para «Otro», indica de qué documento se trata' });
        if (D.docs.some(x => x.id !== d.id && docKey(x) === docKey(v))) er.push({ k: 'vence', msg: 'Ya tienes este mismo documento con esta fecha' });
        return er;
      }, async v => {
        if (isNew && v.vence < isoToday() && !(await ask({ title: 'Esa fecha ya ha pasado', text: 'El documento aparecerá como caducado.', ok: 'Guardar así', cancel: 'Corregir la fecha' }))) return '';
        await put('docs', { ...d, ...v }); await s.close(); toast('Documento guardado'); refresh();
      });
      const r = s.el.querySelector('[data-ren]');
      if (r) r.onclick = () => { s.close().then(() => renewSheet(d)); };
      const x = s.el.querySelector('[data-del]');
      if (x) x.onclick = async () => { const old = { ...d }; await del('docs', d.id); await s.close(); refresh(); undo('Documento eliminado', async () => { await put('docs', old); refresh(); }); };
    }
  });
}
function renewSheet(d) {
  const base = d.vence && d.vence > isoToday() ? d.vence : isoToday();
  const def = d.tipo === 'ITV' ? String(itvMeses(vehicle().catITV)) : '12';
  const F = [
    { k: 'meses', l: 'Nueva vigencia', t: 'select', o: [['12', '1 año'], ['24', '2 años'], ['6', '6 meses'], ['0', 'Otra fecha']], help: d.tipo === 'ITV' ? (vehicle().catITV ? `Según la categoría de tu ficha técnica: cada ${def === '6' ? '6 meses' : 'año'}` : 'Indica la categoría de la ficha técnica en Ajustes → Vehículo y lo sabré') : '' },
    { k: 'vence', l: 'Nueva fecha de caducidad', t: 'date', req: 'Indica la nueva fecha', minDate: () => addDays(d.vence || isoToday(), 1), maxDate: () => addMonths(isoToday(), 12 * 20) },
    { k: 'importe', l: 'Importe pagado (€)', t: 'number', step: 0.01, min: 0, max: 20000, dec: 2, thou: true },
    { k: 'gasto', l: 'Añadir a gastos', t: 'switch', def: true },
  ];
  sheet({
    title: 'Renovar ' + d.tipo, body: form(F, { meses: def, vence: addMonths(base, +def), importe: d.importe || '' }), foot: actions('Renovar'),
    onMount: s => {
      const m = s.el.querySelector('[name=meses]'), v = s.el.querySelector('[name=vence]');
      m.onchange = () => { if (+m.value) v.value = addMonths(base, +m.value); };
      onSubmit(s, F, f => (f.gasto && !f.importe ? [{ k: 'importe', msg: 'Indica el importe o desmarca «Añadir a gastos»' }] : []), async f => {
        await put('docs', { ...d, vence: f.vence, importe: f.importe || d.importe });
        if (f.gasto && f.importe > 0) {
          const cat = d.tipo === 'Seguro' || d.tipo === 'Asistencia en carretera' ? 'Seguro' : d.tipo === 'Impuesto de circulación' || d.tipo === 'ITV' ? 'Impuestos y tasas' : 'Otros';
          await put('expenses', { fecha: isoToday(), cat, importe: f.importe, concepto: d.tipo + (d.nombre ? ' · ' + d.nombre : '') });
        }
        await s.close(); toast(`${d.tipo} renovado hasta el ${fDate(f.vence)}`); refresh();
      });
    }
  });
}

/* ---------- Vehículo ---------- */
export const VEH_F = [
  { k: 'nombre', l: 'Nombre (para ti)', ph: 'Ej. La Tortuga', req: 'Ponle un nombre a tu autocaravana', minLen: 2, maxLen: 40 },
  { k: 'matricula', adv: 1, l: 'Matrícula', ph: '1234 BCD', maxLen: 14, norm: normPlate, check: checkPlate },
  { k: 'marca', l: 'Marca y modelo', ph: 'Ej. Benimar Tessoro 482', req: 'Indica la marca y el modelo', minLen: 2, maxLen: 60 },
  { k: 'base', adv: 1, l: 'Base / motor', ph: 'Ej. Fiat Ducato 2.2 140 CV', maxLen: 60 },
  { k: 'carroceria', adv: 1, l: 'Tipo de autocaravana', t: 'select', o: ['Capuchina', 'Perfilada', 'Integral', 'Camper'] },
  { k: 'fechaMat', l: 'Fecha de 1ª matriculación', t: 'date', past: true, minDate: '1994-01-01', maxDate: '2002-12-31', help: 'Está en el permiso de circulación. La serie 230 se fabricó de 1994 a 2002.' },
  { k: 'fechaCompra', adv: 1, l: 'Fecha en que la compraste', t: 'date', past: true, minDate: '1994-01-01', after: 'fechaMat', afterMsg: 'No puede ser antes de la matriculación', help: 'Opcional: referencia si no sabes cuándo se hizo un mantenimiento' },
  { k: 'kmCompra', adv: 1, l: 'Km cuando la compraste', t: 'number', step: 1, int: true, min: 0, max: KM_MAX, check: (v, a) => (a.km !== '' && v > a.km ? 'No puede ser más que los km actuales' : null) },
  { k: 'catITV', adv: 1, l: 'Categoría en la ficha técnica', t: 'select', o: ITV_CAT, full: 1, help: 'Decide si la ITV es anual o cada 6 meses' },
  { k: 'km', l: 'Kilómetros actuales', t: 'number', step: 1, int: true, min: 0, max: KM_MAX, req: 'Indica los km actuales: el plan de mantenimiento los necesita', help: 'Aproximados valen: los repostajes y mantenimientos que apuntes después mandan' },
  { t: 'section', adv: 1, l: 'Medidas (para planificar rutas)' },
  { t: 'note', adv: 1, l: PERFIL.ayudaMedidas },
  { k: 'altura', adv: 1, l: 'Altura (m)', t: 'number', step: 0.01, min: 1.5, max: 4.5, dec: 2, help: 'Con antena y claraboyas' },
  { k: 'longitud', adv: 1, l: 'Longitud (m)', t: 'number', step: 0.01, min: 3, max: 14, dec: 2 },
  { k: 'anchura', adv: 1, l: 'Anchura (m)', t: 'number', step: 0.01, min: 1.5, max: 2.6, dec: 2, help: 'Sin retrovisores' },
  { k: 'mma', adv: 1, l: 'MMA (kg)', t: 'number', step: 10, int: true, min: 1500, max: 7500 },
  { k: 'deposito', adv: 1, l: 'Depósito combustible (L)', t: 'number', step: 1, int: true, min: 30, max: 300 },
  { k: 'aguaLimpia', adv: 1, l: 'Agua limpia (L)', t: 'number', step: 1, int: true, min: 0, max: 500 },
];
export function vehicleSheet(onDone) {
  const v0 = vehicle(), first = !v0.nombre;
  const init = first ? { ...PERFIL.vehiculo, ...v0 } : v0;
  const cur = currentKm(D);
  // Solo los km de verdad (repostajes, revisiones, lecturas) ponen un mínimo. Los aproximados de esta misma
  // ficha se pueden corregir a la baja: si al configurar te equivocaste de cifra, no te quedas atrapado.
  const real = kmPoints(D).filter(x => !x.aprox).reduce((m, x) => Math.max(m, x.km), 0);
  sheet({
    title: first ? 'Tu autocaravana' : 'Editar autocaravana',
    body: (first ? `<p class="hint" style="margin-bottom:12px">He rellenado lo que sé de tu ${esc(PERFIL.nombre)}. Lo obligatorio es el nombre, la marca y los km; el resto puedes completarlo luego en Ajustes.</p>` : '') + form(VEH_F, init),
    foot: actions(first ? 'Continuar' : 'Guardar'),
    onMount: s => onSubmit(s, VEH_F, v => {
      const er = [];
      if (v.km < real) er.push({ k: 'km', msg: `Tus registros ya marcan ${fKm(real)}: no puede ser menos` });
      if (v.fechaMat && v.km > 0) { const years = Math.max(0.1, (Date.now() - new Date(v.fechaMat)) / 3.156e10); if (v.km / years > 150000) er.push({ k: 'km', msg: `Son más de ${fKm(150000)} al año desde la matriculación: revisa los km` }); }
      return er;
    }, async v => {
      if (v.km < cur) {
        const ok = await ask({ title: 'Corregir los kilómetros', text: `Antes pusiste ${fKm(cur)} y ahora ${fKm(v.km)}. Cambio el dato aproximado por el nuevo.`, ok: 'Sí, corregir' });
        if (!ok) return '';
        for (const o of D.odo.filter(o => o.aprox && o.km > v.km)) await del('odo', o.id);
      }
      await setKV('vehicle', { ...v0, ...v });
      // Dato de referencia: no impide apuntar después repostajes o mantenimientos con los km exactos
      if (v.km > currentKm(D) || (v.km < cur && v.km > real)) await put('odo', { fecha: isoToday(), km: v.km, aprox: true });
      toast(first ? 'Autocaravana guardada' : 'Datos guardados');
      await s.close(); onDone ? onDone() : refresh();
    })
  });
}

/* ---------- Alta rápida (botón +) ---------- */
export function quickAdd() {
  const opts = [
    ['fuel', 'Repostaje', 'Litros, precio y km', () => expenseSheet({}, { cat: 'Combustible' })],
    ['euro', isSimple() ? 'Otro gasto' : 'Gasto', 'Área, peaje, equipamiento…', () => expenseSheet({}, { cat: 'Área / camping' })],
    ['wrench', isSimple() ? 'Revisión hecha' : 'Mantenimiento', isSimple() ? 'Aceite, filtros, gas…' : 'Algo que has hecho', () => import('./mods/mant.js').then(m => m.pickTask())],
    ['gauge', 'Kilómetros', 'Actualizar el cuentakilómetros', odoSheet],
    ['map', 'Viaje', 'Planificar uno nuevo', () => { location.hash = '#/viajes/nuevo'; }],
    ['doc', 'Documento', 'ITV, seguro, impuesto…', () => docSheet({})],
  ];
  sheet({
    title: '¿Qué quieres apuntar?',
    body: `<div class="qa">${opts.map(([ic, t, s], i) => `<button data-i="${i}">${icon(ic)}<b>${t}</b><small>${s}</small></button>`).join('')}</div>`,
    onMount: s => s.el.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => s.close().then(opts[+b.dataset.i][3]))),
  });
}
