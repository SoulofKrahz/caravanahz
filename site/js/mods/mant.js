import { D, put, del } from '../db.js';
import { esc, icon, fKm, fDate, fEur, rel, stChip, sheet, toast, undo, fNum } from '../ui.js';
import { ctx, tasksWithStatus, ZONA_ICO, vehicle } from '../store.js';
import { FUENTE_TXT } from '../perfil.js';
import { normKey } from '../valid.js';
import { isoToday, currentKm } from '../logic.js';
import { serviceSheet, taskSheet } from '../forms.js';
import { go, refresh } from '../router.js';

let tab = 'plan';
const openG = new Set((() => { try { return JSON.parse(localStorage.getItem('cz_mg')) || ['nd']; } catch (e) { return ['nd']; } })());

function intervalTxt(t) {
  const a = [];
  if (+t.intMeses) a.push(+t.intMeses === 12 ? 'cada año' : +t.intMeses % 12 === 0 ? `cada ${t.intMeses / 12} años` : `cada ${t.intMeses} ${+t.intMeses === 1 ? 'mes' : 'meses'}`);
  if (+t.intKm) a.push('cada ' + fKm(+t.intKm));
  return a.join(' o ') + (a.length > 1 ? ', lo que llegue antes' : '');
}
function dueTxt(s) {
  if (s.state === 'nd') return 'Falta indicar la última vez';
  const p = [];
  if (s.dueDate) p.push(s.daysLeft < -730 ? 'Sin hacer desde ' + fDate(s.dueDate, { year: 'numeric' }) : (s.daysLeft < 0 ? 'Venció ' : 'Vence ') + rel(s.dueDate));
  if (s.dueKm) p.push(s.kmLeft < 0 ? `pasado en ${fKm(-s.kmLeft)}` : `faltan ${fKm(s.kmLeft)}`);
  if (!s.dueDate && s.projDate && s.kmLeft >= 0) p.push('≈ ' + fDate(s.projDate, { month: 'short', year: 'numeric' }));
  return p.join(' · ');
}

export function render(view, params) {
  if (params[0] === 'completar') return completar(view);
  const c = ctx(), tw = tasksWithStatus(c);
  const groups = [['over', 'Vencido'], ['soon', 'Próximo'], ['nd', 'Sin datos'], ['ok', 'Al día']];
  const hist = D.services.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (+b.km || 0) - (+a.km || 0));

  const row = ({ t, s }) => `<button class="row" data-t="${t.id}"><span class="ico">${icon(ZONA_ICO[t.zona] || 'wrench')}</span>
    <span class="m"><b>${esc(t.nombre)}</b><small>${esc(dueTxt(s))}</small>${s.state !== 'nd' ? `<span class="prog ${s.state}"><i style="width:${Math.round(s.pct * 100)}%"></i></span>` : ''}</span>${stChip(s.state)}</button>`;

  let body;
  if (tab === 'plan') {
    body = !tw.length ? `<div class="empty"><h3>Sin plan de mantenimiento</h3><p>Añade las tareas que quieras seguir.</p><button class="btn" id="seed">Usar plan de partida</button></div>`
      : groups.map(([k, l]) => {
          const g = tw.filter(x => x.s.state === k); if (!g.length) return '';
          // Vencido y Próximo siempre abiertos; «Sin datos» y «Al día» plegables (se recuerda)
          const fold = k === 'nd' || k === 'ok', open = !fold || openG.has(k);
          return `<${fold ? 'button' : 'div'} class="gh${fold ? ' fold' : ''}" ${fold ? `data-g="${k}" aria-expanded="${open}"` : ''}><span>${l}</span><span>${g.length}${fold ? icon(open ? 'up' : 'down') : ''}</span></${fold ? 'button' : 'div'}>${open ? `<div class="list">${g.map(row).join('')}</div>` : ''}`;
        }).join('')
      + `<p class="hint" style="margin:16px 4px 0">Plan para Fiat Ducato 1.9 TD de 1999 con célula capuchina. No hay un libro de mantenimiento oficial accesible en línea para este motor: cada tarea indica en su ficha si el intervalo sale de propietarios, de la normativa o de un criterio prudente por la edad. Si tienes el libro o un taller de confianza, manda lo que digan ellos.${c.rate ? '' : ' Cuando tengas registros de km de al menos un mes, también estimaré la fecha de las tareas que van por kilómetros.'}</p>`;
  } else {
    const byY = {}; hist.forEach(h => (byY[h.fecha.slice(0, 4)] = byY[h.fecha.slice(0, 4)] || []).push(h));
    body = !hist.length ? `<div class="empty"><h3>Historial vacío</h3><p>Cada vez que marques una tarea como hecha o registres una reparación, aparecerá aquí.</p></div>`
      : Object.keys(byY).sort().reverse().map(y => { const tot = byY[y].reduce((a, h) => a + (+h.coste || 0), 0);
        return `<div class="gh"><span>${y}</span><span>${byY[y].length} · ${fEur(tot)}</span></div><div class="list">` + byY[y].map(h =>
          `<button class="row" data-h="${h.id}"><span class="ico">${icon(ZONA_ICO[h.zona] || 'wrench')}</span><span class="m"><b>${esc(h.nombre)}</b><small>${fDate(h.fecha)}${h.km ? ' · ' + fKm(h.km) : ''}${h.taller ? ' · ' + esc(h.taller) : ''}</small></span><span class="r">${h.coste ? `<b>${fEur(h.coste)}</b>` : ''}</span></button>`).join('') + '</div>'; }).join('');
  }

  view.innerHTML = `<div class="vh"><div><h1>Mantenimiento</h1><p>${fKm(c.km)} · ${tw.filter(x => x.s.state === 'over').length} vencidas · ${tw.filter(x => x.s.state === 'soon').length} próximas</p></div></div>
    <div class="tools"><div class="seg" id="seg"><button data-v="plan" class="${tab === 'plan' ? 'on' : ''}">Plan</button><button data-v="hist" class="${tab === 'hist' ? 'on' : ''}">Historial ${hist.length}</button></div>
    <button class="btn" id="add">${icon('plus')}${tab === 'plan' ? 'Tarea' : 'Reparación'}</button></div>
    ${body}<div class="pb"></div>`;

  view.querySelector('#seg').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; render(view, params); } };
  view.querySelector('#add').onclick = () => (tab === 'plan' ? taskSheet() : serviceSheet(null));
  const sd = view.querySelector('#seed'); if (sd) sd.onclick = async () => { const { seedPlan } = await import('../store.js'); await seedPlan(); go('mant/completar'); };
  view.querySelectorAll('[data-g]').forEach(b => (b.onclick = () => {
    const k = b.dataset.g; openG.has(k) ? openG.delete(k) : openG.add(k);
    try { localStorage.setItem('cz_mg', JSON.stringify([...openG])); } catch (e) {}
    render(view, params);
  }));
  view.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => taskDetail(D.tasks.find(t => t.id === b.dataset.t))));
  view.querySelectorAll('[data-h]').forEach(b => (b.onclick = () => { const h = D.services.find(x => x.id === b.dataset.h); serviceSheet(h.tareaId ? D.tasks.find(t => t.id === h.tareaId) || null : null, h); }));
}

/** ¿Qué has hecho? Elegir una tarea del plan (las pendientes primero) o una reparación suelta */
export function pickTask() {
  const tw = tasksWithStatus(ctx());
  const row = ({ t, s }) => `<button class="row" data-t="${t.id}" data-q="${esc(normKey(t.nombre + ' ' + t.zona))}"><span class="ico">${icon(ZONA_ICO[t.zona] || 'wrench')}</span><span class="m"><b>${esc(t.nombre)}</b><small>${esc(t.zona)}</small></span>${stChip(s.state)}</button>`;
  sheet({
    title: '¿Qué has hecho?',
    body: `<div class="srch" style="margin-bottom:10px">${icon('wrench')}<input id="pq" type="search" placeholder="Buscar: aceite, frenos, gas…" autocomplete="off" aria-label="Buscar tarea"></div>
      <div class="list" id="pl"><button class="row" data-free><span class="ico">${icon('plus')}</span><span class="m"><b>Otra reparación</b><small>Algo que no está en el plan</small></span></button>${tw.map(row).join('')}</div>`,
    onMount: sh => {
      const q = sh.el.querySelector('#pq');
      q.oninput = () => { const k = normKey(q.value); sh.el.querySelectorAll('[data-q]').forEach(r => (r.hidden = !!k && !r.dataset.q.includes(k))); };
      sh.el.querySelector('[data-free]').onclick = () => sh.close().then(() => serviceSheet(null, q.value.trim() ? { nombre: q.value.trim() } : {}));
      sh.el.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => sh.close().then(() => serviceSheet(D.tasks.find(t => t.id === b.dataset.t)))));
    }
  });
}

/** Ficha de una tarea: estado, intervalo, notas e historial */
export function taskDetail(t) {
  if (!t) return;
  const c = ctx(), s = tasksWithStatus(c).find(x => x.t.id === t.id).s;
  const h = D.services.filter(x => x.tareaId === t.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const rows = [
    ['Frecuencia', intervalTxt(t)],
    ...(t.fuente && FUENTE_TXT[t.fuente] ? [['Origen del intervalo', FUENTE_TXT[t.fuente]]] : []),
    ['Última vez', t.ultFecha || t.ultKm ? [t.ultFecha ? fDate(t.ultFecha) : '', t.ultKm ? fKm(t.ultKm) : ''].filter(Boolean).join(' · ') : '—'],
    ['Próxima', [s.dueDate ? fDate(s.dueDate) : '', s.dueKm ? fKm(s.dueKm) : ''].filter(Boolean).join(' o ') || '—'],
    ...(s.projDate ? [['Por km, hacia el', fDate(s.projDate) + ' (estimado por tu ritmo de uso)']] : []),
  ];
  sheet({
    title: t.nombre,
    body: `<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">${stChip(s.state)}<span class="hint">${esc(t.zona)} · ${esc(dueTxt(s))}</span></div>
      <div class="list">${rows.map(([a, b]) => `<div class="row"><span class="m"><small>${a}</small><b style="white-space:normal">${esc(b)}</b></span></div>`).join('')}</div>
      ${t.notas ? `<p style="margin:12px 2px;white-space:pre-wrap">${esc(t.notas)}</p>` : ''}
      <div class="gh"><span>Historial</span><span>${h.length}</span></div>
      ${h.length ? `<div class="list">${h.map(x => `<button class="row" data-h="${x.id}"><span class="m"><b>${fDate(x.fecha)}${x.km ? ' · ' + fKm(x.km) : ''}</b><small>${esc([x.taller, x.notas].filter(Boolean).join(' · ') || 'Sin notas')}</small></span><span class="r">${x.coste ? `<b>${fEur(x.coste)}</b>` : ''}</span></button>`).join('')}</div>` : '<p class="hint">Aún no hay registros.</p>'}`,
    foot: `<button class="btn g" data-e>${icon('edit')}Editar</button><button class="btn" data-ok>${icon('check')}Marcar como hecho</button>`,
    onMount: sh => {
      sh.el.querySelector('[data-ok]').onclick = () => { sh.close().then(() => serviceSheet(t)); };
      sh.el.querySelector('[data-e]').onclick = () => { sh.close().then(() => taskSheet(t)); };
      sh.el.querySelectorAll('[data-h]').forEach(b => (b.onclick = () => { sh.close().then(() => serviceSheet(t, D.services.find(x => x.id === b.dataset.h))); }));
    }
  });
}

/** Rellenar de una vez la «última vez» de las tareas sin datos */
function completar(view) {
  const nd = D.tasks.filter(t => !t.ultFecha && (t.ultKm === '' || t.ultKm == null)).sort((a, b) => a.zona.localeCompare(b.zona) || a.nombre.localeCompare(b.nombre));
  const v = vehicle(), ref = v.fechaCompra || v.fechaMat, refTxt = v.fechaCompra ? 'la fecha de compra' : 'la de matriculación';
  if (!nd.length) { view.innerHTML = `<div class="empty"><h3>Plan completo</h3><p>Todas las tareas tienen su última vez. Ya puedo avisarte.</p><a class="btn" href="#/mant">Ver el plan</a></div>`; return; }
  view.innerHTML = `<div class="vh"><div><a class="back" href="#/mant">${icon('left')}Mantenimiento</a><h1>¿Cuándo se hizo por última vez?</h1>
    <p>${nd.length} tareas. Rellena las que sepas y quita las que no apliquen a tu autocaravana.</p></div></div>
    <p class="fm" style="margin-bottom:14px">Si no sabes cuándo se hizo algo en una autocaravana de 1999, lo prudente es darlo por pendiente: pon ${v.fechaCompra ? 'la fecha de compra' : 'la fecha en que la compraste (puedes indicarla en Ajustes → Vehículo)'} y te avisará ya. Con la correa de distribución no te arriesgues: si no hay factura que lo demuestre, cámbiala.</p>
    <div class="list" id="cl">${nd.map(t => `<div class="row" data-id="${t.id}" style="flex-wrap:wrap">
      <span class="m" style="flex:1 1 200px"><b>${esc(t.nombre)}</b><small>${esc(t.zona)} · ${esc(intervalTxt(t))}</small></span>
      <span style="display:flex;gap:8px;flex:1 1 260px;align-items:center">
        <input type="date" data-f max="${isoToday()}" ${v.fechaMat ? `min="${v.fechaMat}"` : ''} aria-label="Fecha" style="flex:1;min-width:0;padding:9px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);font-size:16px">
        ${+t.intKm ? `<input type="number" inputmode="numeric" step="1" min="0" data-k placeholder="km" aria-label="Kilómetros" style="width:100px;padding:9px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);font-size:16px">` : ''}
        <button class="ib" data-del aria-label="Quitar del plan" title="No aplica: quitar del plan">${icon('trash')}</button></span></div>`).join('')}</div>
    <div class="brow" style="margin-top:14px">${ref ? `<button class="btn g" id="all">Poner ${refTxt} (${fDate(ref)}) en las vacías</button>` : ''}<button class="btn" id="sv">${icon('check')}Guardar</button></div><div class="pb"></div>`;

  view.querySelectorAll('[data-del]').forEach(b => (b.onclick = async () => {
    const r = b.closest('[data-id]'), t = D.tasks.find(x => x.id === r.dataset.id);
    await del('tasks', t.id); r.remove();
    undo(`«${t.nombre}» quitada del plan`, async () => { await put('tasks', t); refresh(); });
  }));
  const all = view.querySelector('#all');
  if (all) all.onclick = () => view.querySelectorAll('[data-id]').forEach(r => {
    const f = r.querySelector('[data-f]'), k = r.querySelector('[data-k]');
    if (!f.value) { f.value = ref; if (k && !k.value) k.value = v.fechaCompra ? (v.kmCompra ?? '') : 0; }
  });
  view.querySelector('#cl').addEventListener('input', e => { const r = e.target.closest('[data-id]'); if (r) rowErr(r, ''); });
  const cur = currentKm(D);
  view.querySelector('#sv').onclick = async () => {
    const todo = [], today = isoToday(); let bad = null;
    for (const r of view.querySelectorAll('[data-id]')) {
      const t = D.tasks.find(x => x.id === r.dataset.id); if (!t) continue;
      const fi = r.querySelector('[data-f]'), ki = r.querySelector('[data-k]');
      const f = fi.value, kraw = ki ? ki.value.trim() : '', k = kraw === '' ? '' : +kraw;
      let msg = '';
      if ((fi.validity && fi.validity.badInput) || (ki && ki.validity && ki.validity.badInput)) msg = 'Dato no válido';
      else if (!f && k === '') { rowErr(r, ''); continue; }
      else if (f && f > today) msg = 'La fecha no puede ser futura';
      else if (f && v.fechaMat && f < v.fechaMat) msg = 'Es anterior a la matriculación (' + fDate(v.fechaMat) + ')';
      else if (k !== '' && (!Number.isInteger(k) || k < 0)) msg = 'Los km deben ser un número entero';
      else if (k !== '' && cur && k > cur) msg = 'No puede superar los km actuales (' + fKm(cur) + ')';
      else if (+t.intMeses && !f) msg = 'Va por tiempo: falta la fecha';
      else if (+t.intKm && k === '') msg = 'Va por km: faltan los km';
      rowErr(r, msg);
      if (msg) { bad = bad || r; continue; }
      todo.push({ ...t, ultFecha: f, ultKm: k, manFecha: f, manKm: k });
    }
    if (bad) { bad.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast('Revisa las tareas marcadas en rojo'); return; }
    if (!todo.length) { toast('No has rellenado ninguna tarea'); return; }
    for (const t of todo) await put('tasks', t);
    toast(`${todo.length} ${todo.length === 1 ? 'tarea actualizada' : 'tareas actualizadas'}`);
    go('mant');
  };
}
function rowErr(r, msg) {
  r.classList.toggle('bad', !!msg);
  let e = r.querySelector('.er');
  if (msg) { if (!e) { e = document.createElement('small'); e.className = 'er'; e.style.flexBasis = '100%'; r.appendChild(e); } e.textContent = msg; }
  else if (e) e.remove();
}
