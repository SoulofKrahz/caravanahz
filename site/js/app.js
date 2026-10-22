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
import { initBack, goMain } from './atras.js';

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
// Pantallas principales: no se apilan en el historial (ver atras.js)
document.addEventListener('click', e => {
  const a = e.target.closest('#bb a, #topnav a, #cfg'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault(); goMain(a.getAttribute('href').replace(/^#\//, ''));
});
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
let newReady = false, newVer = '', dismissed = '';
// «2026-10-22-10» es más nueva que «2026-10-22-9» (se compara número a número, no como texto)
const newer = (a, b) => { const x = a.split(/[-.]/).map(Number), y = b.split(/[-.]/).map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
const showNew = () => {
  if (dismissed && dismissed === (newVer || 'lista')) return;
  $('#vnt').textContent = 'Hay una versión nueva';
  $('#vnv').innerHTML = (newVer ? `Versión <span class="nw">${esc(newVer)}</span> · ahora tienes la <span class="nw">${esc(VER)}</span><br>` : '') + (newReady ? 'Ya está descargada. Tarda un segundo y no pierdes nada.' : 'Tarda un segundo y no pierdes nada.');
  $('#vnb').hidden = false;
};
const regUpdate = async () => { try { const r = swOK && (await navigator.serviceWorker.getRegistration()); if (r) await r.update(); return !!r; } catch (e) { return false; } };
{
  let last = 0;
  const chk = force => {
    if (!/^https?:$/.test(location.protocol) || (force !== true && (document.hidden || Date.now() - last < 6e5))) return;
    last = Date.now();
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(v => {
      v = (v || '').trim();
      if (/^\d{4}-\d\d-\d\d-[\d.]+$/.test(v) && newer(v, VER)) { newVer = v; showNew(); regUpdate(); }
    }).catch(() => {});
  };
  setTimeout(chk, 2500); document.addEventListener('visibilitychange', chk); setInterval(chk, 18e5);
  window.__czChk = () => chk(true);
  // «Ahora no»: no vuelve a salir para esa versión hasta que abras la app otra vez
  $('#vnx').onclick = () => { dismissed = newVer || 'lista'; $('#vnb').hidden = true; };
  $('#vng').onclick = async () => {
    const b = $('#vng');
    if (busy()) return toast('Primero guarda o cierra lo que tienes abierto');
    if (newReady || !swOK) return location.reload();
    b.disabled = true; b.classList.add('spin'); b.innerHTML = `${icon('rf')}Actualizando…`; $('#vnx').hidden = true;
    await regUpdate();
    // Se espera a que la versión nueva esté guardada entera (como mucho 20 s): nunca se queda a medias
    const ok = await new Promise(res => { if (newReady) return res(true); const t = setTimeout(() => res(false), 20000); addEventListener('cz-new-ready', () => { clearTimeout(t); res(true); }, { once: true }); });
    if (ok) location.reload();
    else { b.disabled = false; b.classList.remove('spin'); b.innerHTML = `${icon('rf')}Actualizar ahora`; $('#vnx').hidden = false; toast('La conexión va muy lenta. Se descargará sola cuando haya mejor cobertura'); }
  };
}
// Después de actualizar, un aviso confirma la versión nueva (así se sabe que ha funcionado)
{
  let prev = null; try { prev = localStorage.getItem('cz_ver'); localStorage.setItem('cz_ver', VER); } catch (e) {}
  if (prev && prev !== VER) setTimeout(() => toast(`Caravanahz actualizada (versión ${VER})`), 900);
}

/* PWA */
if (swOK) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return; // primera instalación: no hay nada que actualizar
    newReady = true; dispatchEvent(new Event('cz-new-ready'));
    if (!$('#vng').disabled) showNew();
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
  if (!location.hash.replace(/^#\/?/, '')) history.replaceState(history.state, '', '#/' + (prefs().start || 'inicio'));
  initBack();
  await refresh(false);
})();
