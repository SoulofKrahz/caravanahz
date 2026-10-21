import { D, getKV, setKV } from '../db.js';
import { esc, icon, fKm, fEur, fEur0, fNum, fDate, rel, stChip, toast } from '../ui.js';
import { ctx, tasksWithStatus, docsWithStatus, vehicle, seedPlan, ZONA_ICO, prefs, needsProfilePlan, applyProfilePlan } from '../store.js';
import { PERFIL } from '../perfil.js';
import { consumption, kmBetween, isoToday, daysBetween } from '../logic.js';
import { odoSheet, expenseSheet, serviceSheet, docSheet, vehicleSheet } from '../forms.js';
import { taskDetail, pickTask } from './mant.js';
import { tripKmSheet } from './viajes.js';
import { docName } from './gastos.js';
import { bannerDue, bannerText, canPrompt, install, snooze } from '../install.js';
import { go } from '../router.js';
import { backupJSON } from './ajustes.js';

/** Km recorridos en un año natural (interpolando entre lecturas) */
export function kmInYear(year) { return kmBetween(D, year + '-01-01', year + '-12-31'); }

export function render(view) {
  if (!getKV('setup', false)) return welcome(view);
  const c = ctx(), v = vehicle(), year = new Date().getFullYear();
  const tw = tasksWithStatus(c), dw = docsWithStatus(c);
  const att = [
    ...tw.filter(x => x.s.state === 'over' || x.s.state === 'soon').map(x => ({ kind: 't', ...x, when: x.s.when })),
    ...dw.filter(x => x.s.state === 'over' || x.s.state === 'soon').map(x => ({ kind: 'd', ...x, when: x.d.vence })),
  ].sort((a, b) => (a.s.state === 'over' ? 0 : 1) - (b.s.state === 'over' ? 0 : 1) || (a.when || '').localeCompare(b.when || ''));
  const nd = tw.filter(x => x.s.state === 'nd').length;
  const gY = D.expenses.filter(e => e.fecha && e.fecha.startsWith(year)).reduce((s, e) => s + (+e.importe || 0), 0);
  const kmY = kmInYear(year), cons = consumption(D.expenses), fuelY = D.expenses.filter(e => e.cat === 'Combustible' && (e.fecha || '').startsWith(year)).reduce((a, e) => a + (+e.importe || 0), 0);
  const today = isoToday();
  const next = D.trips.filter(t => (t.fin || t.inicio) >= today).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''))[0];
  const last = D.trips.filter(t => (t.fin || t.inicio) < today).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))[0];

  // Pedir los km reales justo cuando tocan: al salir y al volver
  const kmAsk = (() => {
    for (const t of D.trips) {
      if (!t.inicio || t.inicio > today) continue;
      const end = t.fin || t.inicio;
      if (!t.kmIni && daysBetween(t.inicio, today) <= 3) return { t, which: 'ini' };
      if (t.kmIni && !t.kmFin && end <= today && daysBetween(end, today) <= 14) return { t, which: 'fin' };
    }
    return null;
  })();
  // Teléfono de asistencia a mano en Inicio (lo primero que buscas en una avería)
  const asis = D.docs.filter(d => d.tel && (d.tipo === 'Asistencia en carretera' || d.tipo === 'Seguro')).sort((a, b) => (a.tipo === 'Asistencia en carretera' ? -1 : 1))[0];
  const lb = getKV('lastBackup', 0), first = getKV('setupAt', Date.now());
  const showInst = bannerDue();
  const needBk = !showInst && prefs().bkRemind && (D.expenses.length + D.services.length + D.trips.length) > 3 && Date.now() - (lb || first) > 30 * 864e5 && (getKV('bkSnooze', 0) < Date.now());

  const attRow = x => {
    if (x.kind === 't') {
      const s = x.s, parts = [];
      if (s.dueDate) parts.push(fDate(s.dueDate) + ' (' + rel(s.dueDate) + ')');
      if (s.dueKm) parts.push(fKm(s.dueKm) + (s.kmLeft < 0 ? ` · pasado ${fKm(-s.kmLeft)}` : ` · faltan ${fKm(s.kmLeft)}`));
      return `<button class="row" data-t="${x.t.id}"><span class="ico">${icon(ZONA_ICO[x.t.zona] || 'wrench')}</span><span class="m"><b>${esc(x.t.nombre)}</b><small>${esc(parts.join(' · '))}</small></span>${stChip(s.state)}</button>`;
    }
    return `<button class="row" data-d="${x.d.id}"><span class="ico">${icon('doc')}</span><span class="m"><b>${esc(docName(x.d))}</b><small>Caduca el ${fDate(x.d.vence)} (${rel(x.d.vence)})</small></span>${stChip(x.s.state, x.s.state === 'over' ? 'Caducado' : 'Renovar')}</button>`;
  };

  view.innerHTML = `
  <div class="vh"><div><h1>${esc(v.nombre || 'Tu autocaravana')}</h1><p>${esc([v.marca, v.matricula].filter(Boolean).join(' · ') || 'Completa sus datos en Ajustes')}</p></div></div>
  ${kmAsk ? `<div class="banner"><span>${kmAsk.which === 'ini' ? `<b>¿Has salido hacia ${esc(kmAsk.t.nombre)}?</b> Apunta los km del cuentakilómetros para saber lo que recorres de verdad.` : `<b>¿Ya has vuelto de ${esc(kmAsk.t.nombre)}?</b> Apunta los km y el viaje queda cerrado.`}</span><button id="kma">Apuntar km</button></div>` : ''}
  ${needsProfilePlan() ? `<div class="banner"><span><b>Plan específico para tu Ducato 1.9 TD.</b> Sustituye los intervalos genéricos (aceite cada 10.000 km, distribución cada 60.000 km o 3 años, sellado de la capuchina…). Conserva lo que ya hayas apuntado.</span><button id="pp">Aplicar</button></div>` : ''}
  ${showInst ? `<div class="banner" id="ib"><span>${esc(bannerText())}</span>${canPrompt() ? '<button id="ig">Instalar</button>' : ''}<button id="iz">${canPrompt() ? 'Ahora no' : 'Entendido'}</button></div>` : ''}
  ${needBk ? `<div class="banner"><span>${lb ? `Hace ${Math.floor((Date.now() - lb) / 864e5)} días de tu última copia de seguridad.` : 'Aún no has hecho ninguna copia de seguridad.'} Los datos solo están en este dispositivo.</span><button id="bk">Hacer copia</button><button id="bkz">Más tarde</button></div>` : ''}
  <div class="kpis">
    <button class="kpi hero" id="km"><span class="ico" style="width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--tint);color:var(--em)">${icon('gauge')}</span>
      <span class="hb-m"><span class="l">Cuentakilómetros</span><span class="v">${fKm(c.km)}</span><span class="s">${c.rate ? `Unos ${fNum(c.rate * 30, 0)} km al mes` : 'Toca para actualizar'}</span></span>
      <span class="btn sm o hb-act">${icon('edit')}<span>Actualizar</span></span></button>
  </div>
  <div class="kpis k3">
    <div class="kpi"><span class="l">${icon('euro')}Gasto ${year}</span><span class="v">${fEur0(gY)}</span><span class="s">${kmY ? fNum(gY / kmY, 2) + ' €/km' : 'Sin km registrados'}</span></div>
    <div class="kpi"><span class="l">${icon('map')}Km ${year}</span><span class="v">${kmY ? fKm(kmY) : '—'}</span><span class="s">${(n => n + (n === 1 ? ' viaje' : ' viajes'))(D.trips.filter(t => (t.inicio || '').startsWith(year)).length)}</span></div>
    <a class="kpi" href="#/gastos/combustible"><span class="l">${icon('fuel')}Gasóleo ${year}</span><span class="v">${fEur0(fuelY)}</span><span class="s">${cons.eur100 ? fEur(cons.eur100) + ' cada 100 km · ' + fNum(cons.avg) + ' L' : 'Con dos llenos con km: €/100 km'}</span></a>
  </div>

  <div class="sec"><h2>Acciones rápidas</h2>
    <div class="brow"><button class="btn" id="qf">${icon('fuel')}Repostaje</button><button class="btn g" id="qg">${icon('euro')}Gasto</button><button class="btn g" id="qm">${icon('wrench')}Mantenimiento hecho</button><button class="btn g" id="qv">${icon('map')}Nuevo viaje</button></div>
    ${asis ? `<a class="lnk" style="margin:10px 0 0" href="tel:${esc(String(asis.tel).replace(/[^+0-9]/g, ''))}">${icon('phone')}Asistencia en carretera: ${esc(asis.nombre || asis.tipo)} · ${esc(asis.tel)}${icon('right')}</a>` : ''}
  </div>

  <div class="grid2" style="margin-top:20px">
    <div class="sec"><h2>Requiere atención <a href="#/mant">Ver plan</a></h2>
      ${att.length ? `<div class="list">${att.slice(0, 7).map(attRow).join('')}</div>${att.length > 7 ? `<p class="hint" style="margin:8px 4px">Y ${att.length - 7} más en Mantenimiento.</p>` : ''}`
        : `<div class="list"><div class="empty sm">${icon('check')} Todo al día${nd ? '' : '. Nada vence en los próximos ' + c.warnDays + ' días.'}</div></div>`}
      ${nd && prefs().showNd ? `<div class="banner" style="margin:12px 0 0"><span><b>${nd} ${nd === 1 ? 'tarea' : 'tareas'} sin «última vez».</b> Sin esa fecha no puedo avisarte.</span><button id="nd">Completar</button></div>` : ''}
    </div>
    <div class="sec"><h2>Viajes <a href="#/viajes">Ver todos</a></h2>
      <div class="list">
        ${next ? tripRow(next, 'Próximo') : ''}${last ? tripRow(last, 'Último') : ''}
        ${!next && !last ? `<div class="empty sm">Aún no hay viajes. <a href="#/viajes">Planifica el primero</a>.</div>` : ''}
      </div>
      ${D.docs.length ? '' : `<div class="banner" style="margin:12px 0 0"><span>Añade la ITV y el seguro para que te avise antes de que caduquen.</span><button id="nd2">Añadir</button></div>`}
    </div>
  </div>
  <div class="pb"></div>`;

  view.querySelector('#km').onclick = odoSheet;
  view.querySelector('#qf').onclick = () => expenseSheet({}, { cat: 'Combustible' });
  view.querySelector('#qg').onclick = () => expenseSheet({}, { cat: 'Área / camping' });
  view.querySelector('#qm').onclick = pickTask;
  view.querySelector('#qv').onclick = () => go('viajes/nuevo');
  view.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => taskDetail(D.tasks.find(t => t.id === b.dataset.t))));
  view.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => docSheet(D.docs.find(d => d.id === b.dataset.d))));
  const ndb = view.querySelector('#nd'); if (ndb) ndb.onclick = () => go('mant/completar');
  const nd2 = view.querySelector('#nd2'); if (nd2) nd2.onclick = () => docSheet({});
  const kma = view.querySelector('#kma'); if (kma) kma.onclick = () => tripKmSheet(kmAsk.t, kmAsk.which, () => render(view));
  const pp = view.querySelector('#pp');
  if (pp) pp.onclick = async () => { const r = await applyProfilePlan(); toast(`Plan adaptado: ${r.upd} tareas actualizadas, ${r.add} nuevas${r.rem ? ', ' + r.rem + ' retiradas' : ''}`); if (r.add) go('mant/completar'); else render(view); };
  const bk = view.querySelector('#bk'); if (bk) bk.onclick = backupJSON;
  const ig = view.querySelector('#ig'); if (ig) ig.onclick = async () => { await install(); render(view); };
  const iz = view.querySelector('#iz'); if (iz) iz.onclick = () => { snooze(); render(view); };
  const bkz = view.querySelector('#bkz'); if (bkz) bkz.onclick = async () => { await setKV('bkSnooze', Date.now() + 14 * 864e5); render(view); };
}

function tripRow(t, tag) {
  const n = (t.paradas || []).filter(p => p.noche).length, today = isoToday();
  const d = t.inicio ? (t.inicio > today ? rel(t.inicio) : fDate(t.inicio)) : 'Sin fecha';
  return `<a class="row" href="#/viaje/${t.id}"><span class="ico">${icon('map')}</span><span class="m"><b>${esc(t.nombre)}</b><small>${tag} · ${esc(d)}${+t.kmRuta ? ' · ' + fKm(t.kmRuta) : ''}${n ? ' · ' + n + (n === 1 ? ' noche' : ' noches') : ''}</small></span>${icon('right')}</a>`;
}

function welcome(view) {
  view.innerHTML = `<div class="empty" style="padding-top:56px">
    <h3>Bienvenido a Caravanahz</h3>
    <p style="max-width:460px;margin:0 auto">Mantenimiento, viajes, gastos y documentos de tu ${esc(PERFIL.nombre)}. Todo se guarda solo en este dispositivo.</p>
    <div style="margin-top:18px"><button class="btn" id="go">${icon('van')}Configurar mi autocaravana</button></div>
    <p class="hint" style="margin-top:14px;max-width:460px;margin-left:auto;margin-right:auto">Incluye un plan de mantenimiento pensado para el 1.9 TD y una célula capuchina de más de 25 años. Cada intervalo indica de dónde sale y podrás ajustarlo.</p>
  </div>`;
  view.querySelector('#go').onclick = () => vehicleSheet(async () => {
    if (!D.tasks.length) await seedPlan();
    await setKV('setup', true); await setKV('setupAt', Date.now());
    go('mant/completar');
  });
}
