import { loadAll, getKV } from './db.js';
import { $, icon, esc, toast } from './ui.js';
import { route, refresh, onRender, NAV, setGuard } from './router.js';
import { prefs, alertCount, VER } from './store.js';
import { applyLook, savePrefs } from './theme.js';
import { onChange as onInstallChange } from './install.js';
import * as inicio from './mods/inicio.js';
import * as mant from './mods/mant.js';
import * as viajes from './mods/viajes.js';
import * as gastos from './mods/gastos.js';
import * as ajustes from './mods/ajustes.js';
import * as stats from './mods/stats.js';
import { quickAdd } from './forms.js';

route('inicio', inicio.render);
route('mant', mant.render);
route('viajes', viajes.render);
route('viaje', viajes.renderTrip);
route('gastos', gastos.render);
route('ajustes', ajustes.render);
route('stats', stats.render);

/* Navegación: arriba en escritorio, barra inferior en móvil */
function nav(active) {
  const n = alertCount();
  const act = active === 'viaje' ? 'viajes' : active;
  const simple = prefs().simple !== false;
  const html = cls => NAV.map(([k, l, i, ls]) =>
    `<a href="#/${k}" class="${k === act ? 'on' : ''}" ${k === act ? 'aria-current="page"' : ''}>${icon(i)}<span>${simple ? ls : l}</span>${cls && k === 'mant' && n ? `<b aria-label="${n} avisos">${n}</b>` : ''}</a>`).join('');
  $('#topnav').innerHTML = html(false);
  $('#bb').innerHTML = html(true);
  const cfg = $('#cfg'); cfg.classList.toggle('on', active === 'ajustes'); if (active === 'ajustes') cfg.setAttribute('aria-current', 'page'); else cfg.removeAttribute('aria-current');
  // El botón + solo tiene sentido con el vehículo configurado y fuera de Ajustes
  // En modo sencillo, Inicio ya tiene sus botones grandes: allí no hace falta
  $('#fab').hidden = !getKV('setup', false) || active === 'ajustes' || (simple && active === 'inicio');
  document.body.classList.toggle('has-fab', !$('#fab').hidden);
  document.title = (n ? `(${n}) ` : '') + 'Caravanahz';
}
onRender(nav);

$('#fab').onclick = quickAdd;
// El botón + se aparta al bajar (para no tapar cifras) y vuelve al subir
let lastY = 0;
addEventListener('scroll', () => { const y = scrollY, f = $('#fab'); if (Math.abs(y - lastY) < 8) return; f.classList.toggle('off', prefs().simple === false && y > lastY && y > 120); lastY = y; }, { passive: true });
onRender(() => $('#fab').classList.remove('off'));

/* Tema rápido desde la cabecera (el resto de la apariencia está en Ajustes → Apariencia) */
$('#th').onclick = () => savePrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });

/* Si cambia la posibilidad de instalar, se repinta Inicio o Ajustes para mostrar u ocultar la opción */
onInstallChange(() => { const h = location.hash; if (/^#\/(inicio|ajustes\/avanzado)?$/.test(h) || h === '') refresh(); });

/* Actualizaciones (pensadas para viajar)
   - version.txt dice si hay una versión publicada más nueva → se descarga en segundo plano (service worker).
   - Cuando ya está descargada entera, se avisa. Nunca se recarga con una hoja o una pregunta abierta:
     si sales de la app sin nada a medias, se aplica sola; si no, al pulsar «Actualizar ahora». */
const busy = () => !!document.querySelector('.sheet, .ask');
const swOK = 'serviceWorker' in navigator && window.isSecureContext;
let newReady = false;
const showNew = txt => { $('#vnb').hidden = false; $('#vnb span').textContent = txt; };
const regUpdate = async () => { try { const r = swOK && (await navigator.serviceWorker.getRegistration()); if (r) await r.update(); return !!r; } catch (e) { return false; } };
{
  let last = 0;
  const chk = () => {
    if (document.hidden || Date.now() - last < 6e5 || !/^https?:$/.test(location.protocol)) return;
    last = Date.now();
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(v => {
      v = (v || '').trim();
      if (/^\d{4}-\d\d-\d\d-[\d.]+$/.test(v) && v !== VER) { if (!newReady) showNew(`Hay una versión nueva de la app (${v}).`); regUpdate(); }
    }).catch(() => {});
  };
  setTimeout(chk, 2500); document.addEventListener('visibilitychange', chk); setInterval(chk, 18e5);
  $('#vng').onclick = async () => {
    const b = $('#vng');
    if (newReady || !swOK) return location.reload();
    b.disabled = true; b.textContent = 'Descargando…';
    await regUpdate();
    // Se espera a que la versión nueva esté guardada entera (como mucho 20 s)
    const ok = await new Promise(res => { if (newReady) return res(true); const t = setTimeout(() => res(false), 20000); addEventListener('cz-new-ready', () => { clearTimeout(t); res(true); }, { once: true }); });
    if (ok) location.reload();
    else { b.disabled = false; b.textContent = 'Actualizar ahora'; toast('No se ha podido descargar ahora. Se intentará solo cuando haya mejor cobertura'); }
  };
}

/* PWA */
if (swOK) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return; // primera instalación: no hay nada que actualizar
    newReady = true; dispatchEvent(new Event('cz-new-ready'));
    showNew('Hay una versión nueva de la app lista.'); $('#vng').textContent = 'Actualizar ahora'; $('#vng').disabled = false;
  });
  // Al salir de la app (cambiar a otra, bloquear el móvil) y sin nada a medias, se aplica sin que se note
  document.addEventListener('visibilitychange', () => { if (document.hidden && newReady && !busy()) location.reload(); });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(async () => {
  try { await loadAll(); }
  catch (e) {
    $('#view').innerHTML = `<div class="empty"><h3>No se puede abrir el almacenamiento</h3><p>El navegador ha bloqueado la base de datos local (¿modo privado?). Caravanahz necesita guardar los datos en este dispositivo.</p><p class="hint">${esc(e.message || e)}</p></div>`;
    return;
  }
  applyLook();
  // Hasta configurar el vehículo solo existe la bienvenida
  setGuard(name => (!getKV('setup', false) && name !== 'inicio' ? 'inicio' : null));
  if (!location.hash.replace(/^#\/?/, '')) location.hash = '#/' + (prefs().start || 'inicio');
  await refresh(false);
})();
