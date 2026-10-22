// Prueba de humo de Caravanahz: arranca la app en un navegador real (móvil y PC) y comprueba que lo
// principal funciona. Si algo falla, el flujo de GitHub NO publica.
// Uso: node tests/smoke.cjs   (PW_EXE=/ruta/chromium opcional)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), BASE = 'http://app.test/';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const fails = [];
let where = '';
// En GitHub, cada fallo sale también como anotación (se ve en el resumen sin abrir el registro)
const ok = (cond, msg) => { if (!cond) { fails.push(where + msg); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Prueba de humo::${where}${msg}`.replace(/\n/g, ' ')); } console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };
const iso = d => d.toISOString().slice(0, 10);
const today = new Date(), ayer = new Date(Date.now() - 864e5);

async function run(browser, label, viewport, mobile) {
  console.log(`\n== ${label}`); where = label + ': ';
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', locale: 'es-ES' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  // Se sirve site/ directamente; fuera de la app no hay red (mapa, rutas y fuentes fallan como sin conexión)
  await p.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) return r.abort();
    const rel = decodeURIComponent(new URL(u).pathname.slice(1));
    const f = path.join(SITE, rel || 'index.html');
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'no' });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const save = async () => { await p.click('.sheet [data-save]'); await p.waitForTimeout(400); };
  const errsIn = () => p.locator('.sheet .er').allInnerTexts();
  // Cerrar la hoja abierta aceptando «Salir sin guardar» si la app lo pregunta
  const closeSheet = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); if (await p.locator('.ask').count()) { await p.click('.ask [data-ok]'); await p.waitForTimeout(400); } };

  // 1) Primera visita: bienvenida y configuración con validación
  await p.goto(BASE); await p.waitForTimeout(800);
  ok(await p.locator('#go').count() === 1, 'primera visita muestra la bienvenida');
  await p.click('#go'); await p.waitForTimeout(300);
  ok((await p.inputValue('[name=marca]')).startsWith('Fiat Ducato'), 'vehículo con la Ducato prerrellenada');
  ok(await p.evaluate(() => document.documentElement.classList.contains('simple')), 'modo sencillo activado por defecto');
  ok(await p.locator('.sheet details.more').count() === 1, 'los datos opcionales van plegados en «Más datos»');
  await save();
  ok((await p.locator('.sheet .fld.bad').count()) >= 2, 'no deja guardar sin nombre ni km');
  await p.fill('[name=nombre]', 'Prueba'); await p.fill('[name=km]', '145.000'); await p.fill('[name=fechaMat]', '1999-04-15');
  await save(); await p.waitForTimeout(400);
  ok(p.url().includes('#/mant/completar'), 'tras configurar va a completar el plan');
  ok(await p.locator('#cl [data-id]').count() > 20, 'plan de mantenimiento del Ducato cargado');

  // 2) Repostaje: coma decimal y cálculo del importe
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  ok(await p.locator('.bigact button').count() === 4, 'Inicio sencillo con 4 botones grandes');
  const small = await p.evaluate(() => [...document.querySelectorAll('#view button, #view a, .bb a')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44 && !e.closest('.hint'); }).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)));
  if (mobile) ok(!small.length, 'en Inicio (móvil) ningún botón mide menos de 44 px' + (small.length ? ': ' + small.join(', ') : ''));
  await p.click('#qf'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=fecha]', iso(ayer));
  await p.fill('.sheet [name=litros]', '50'); await p.fill('.sheet [name=ppl]', '1,459'); await p.waitForTimeout(100);
  ok((await p.inputValue('.sheet [name=importe]')) === '72,95', 'litros × precio = importe (72,95)');
  await p.fill('.sheet [name=km]', '145.300'); await save();
  ok(await p.locator('.sheet').count() === 0, 'repostaje guardado');
  await p.click('#qf'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=litros]', '40'); await p.fill('.sheet [name=ppl]', '1,5'); await p.fill('.sheet [name=km]', '145.800'); await save();
  await p.goto(BASE + '#/gastos/combustible'); await p.waitForTimeout(500);
  const fuel = (await p.innerText('#body')).replace(/\u00a0/g, ' '); // los importes llevan espacio duro antes de €
  ok((fuel.includes('8 L/100 km') || fuel.includes('8 litros cada 100 km')) && fuel.includes('12,00 €'), 'consumo (8 litros cada 100 km) y coste cada 100 km (12 €)');

  // 3) Km que bajan: rechazados
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  await p.click('#km'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=km]', '140000'); await save();
  ok((await errsIn()).some(t => t.includes('no puede bajar')), 'el cuentakilómetros no puede bajar');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.locator('.ask').count() === 1, 'al salir con algo escrito pregunta con un diálogo propio');
  await p.click('.ask [data-ok]'); await p.waitForTimeout(400);
  ok(await p.locator('.sheet').count() === 0, '«Salir sin guardar» cierra la hoja');

  // 4) Viaje: la vuelta no puede ser antes de la salida
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Picos'); await p.fill('.sheet [name=inicio]', '2030-06-10'); await p.fill('.sheet [name=fin]', '2030-06-05');
  await save();
  ok((await errsIn()).some(t => t.includes('antes de la salida')), 'vuelta anterior a la salida rechazada');
  await p.fill('.sheet [name=fin]', '2030-06-15'); await save(); await p.waitForTimeout(1200);
  ok(p.url().includes('#/viaje/'), 'viaje creado y editor abierto (sin mapa: sin red)');

  // 4b) Viaje de hoy con km de salida y vuelta: queda en «Hechos» y sus km cuentan en Estadísticas
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Escapada de hoy'); await p.fill('.sheet [name=inicio]', iso(today)); await save(); await p.waitForTimeout(1200);
  await p.click('#kmr [data-km=ini]'); await p.waitForTimeout(300);
  ok((await p.inputValue('.sheet [name=km]')) !== '', 'km de salida rellenados con el último dato');
  await save();
  await p.click('#kmr [data-km=fin]'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=km]', '146.150'); await save();
  ok((await p.innerText('#kmr')).includes('350 km recorridos'), 'viaje cerrado: 350 km recorridos');
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  const lista = await p.innerText('#view');
  ok(lista.indexOf('Escapada de hoy') > lista.indexOf('Hechos') && lista.includes('Hechos'), 'con km de vuelta, el viaje aparece en «Hechos» y no en «Próximos»');
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok((await p.innerText('.kpis')).replace(/\u00a0/g, ' ').includes('850 km'), 'Estadísticas cuenta los km del día (repostajes + viaje de hoy: 850 km)');

  // 5) Mantenimiento hecho desde el botón + (móvil) o desde Inicio
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  // En móvil, desde el botón «Apuntar algo» de otra pantalla; en PC, desde Inicio
  if (mobile) { await p.goto(BASE + '#/gastos/gastos'); await p.waitForTimeout(300); await p.click('#fab'); await p.waitForTimeout(300); await p.click('.qa button >> nth=2'); }
  else await p.click('#qm');
  await p.waitForTimeout(400);
  await p.fill('#pq', 'aceite'); await p.click('#pl [data-t]:visible >> nth=0'); await p.waitForTimeout(400);
  await p.fill('.sheet [name=coste]', '145'); await save();
  ok(await p.locator('.sheet').count() === 0, 'mantenimiento registrado (y su gasto)');

  // 6) Todas las pantallas se pintan sin errores ni desbordes
  for (const u of ['#/inicio', '#/mant', '#/viajes', '#/gastos/gastos', '#/gastos/combustible', '#/gastos/docs', '#/stats', '#/ajustes/vehiculo', '#/ajustes/apariencia', '#/ajustes/avisos', '#/ajustes/viajes', '#/ajustes/copia', '#/ajustes/avanzado', '#/mant/completar']) {
    await p.goto(BASE + u); await p.waitForTimeout(350);
    const bad = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || !document.querySelector('#view .vh, #view .empty'));
    if (bad) ok(false, 'pantalla ' + u + ' se pinta bien y sin desbordar');
  }
  ok(true, 'las 14 pantallas revisadas');
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok(await p.locator('.kpis.k3 .kpi').count() === 6 && (await p.locator('.sbars .c').count() >= 1 || await p.locator('.hbars .hb').count() >= 1), 'resumen con indicadores y gasto por mes');

  // 7) Copia de seguridad: se descarga un JSON válido
  await p.goto(BASE + '#/ajustes/copia'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bx')]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok(j.app === 'caravanahz' && j.data.expenses.length >= 3, 'copia de seguridad descargada con los datos');

  // 8) Tema oscuro y color se aplican
  await p.goto(BASE + '#/ajustes/apariencia'); await p.waitForTimeout(300);
  await p.click('[data-pref=theme] [data-v=dark]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'tema oscuro');
  // El engranaje de Ajustes activo se ve como los demás iconos (antes se rellenaba de naranja)
  const cfg = await p.evaluate(() => { const svg = document.querySelector('#cfg svg'), cs = getComputedStyle(svg); return { fill: cs.fill, color: cs.color, em: getComputedStyle(document.documentElement).getPropertyValue('--em').trim() }; });
  ok(cfg.fill === 'none', 'icono de Ajustes activo sin relleno (' + cfg.fill + ')');

  // 9) Detalles que en viaje harían daño
  const Dm = () => p.evaluate(async () => { const m = await import('./js/db.js'); return JSON.parse(JSON.stringify(m.D)); });
  // 9a) Km de la ficha mal puestos: se pueden corregir a la baja (hasta el último dato real)
  await p.goto(BASE + '#/ajustes/vehiculo'); await p.waitForTimeout(300);
  await p.click('#ve'); await p.waitForTimeout(300); await p.fill('.sheet [name=km]', '200.000'); await save();
  await p.click('#ve'); await p.waitForTimeout(300); await p.fill('.sheet [name=km]', '100.000'); await save();
  ok((await errsIn()).some(t => t.includes('146.150')), 'km de la ficha: no por debajo del último dato real');
  await p.fill('.sheet [name=km]', '146.500'); await p.click('.sheet [data-save]'); await p.waitForTimeout(300);
  ok(await p.locator('.ask').count() === 1, 'corregir km a la baja pide confirmación');
  await p.click('.ask [data-ok]'); await p.waitForTimeout(500);
  ok((await p.innerText('#view')).replace(/\u00a0/g, ' ').includes('146.500 km'), 'km de la ficha corregidos de 200.000 a 146.500');
  // 9b) Importes con punto de miles
  await p.goto(BASE + '#/gastos/gastos'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.selectOption('.sheet [name=cat]', 'Mantenimiento'); await p.fill('.sheet [name=importe]', '1.234'); await save();
  ok((await Dm()).expenses.some(e => e.importe === 1234), 'importe «1.234» se guarda como 1.234 €');
  // 9c) Botón Atrás con una pregunta abierta: la cancela y la hoja sigue
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  await p.click('#km'); await p.waitForTimeout(300); await p.fill('.sheet [name=km]', '147000');
  await p.evaluate(() => history.back()); await p.waitForTimeout(300);
  ok(await p.locator('.ask').count() === 1, 'Atrás con datos escritos pregunta');
  await p.evaluate(() => history.back()); await p.waitForTimeout(300);
  ok(await p.locator('.ask').count() === 0 && await p.locator('.sheet').count() === 1, 'Atrás otra vez cancela la pregunta y la hoja sigue abierta');
  await closeSheet();
  ok(await p.locator('.sheet').count() === 0, 'la hoja se cierra después normalmente');
  // 9d) Completar el plan con km a la española
  await p.goto(BASE + '#/mant/completar'); await p.waitForTimeout(300);
  const row = p.locator('#cl [data-id]:has([data-k])').first(), tid = await row.getAttribute('data-id');
  await row.locator('[data-f]').fill('2024-05-01'); await row.locator('[data-k]').fill('120.000');
  await p.click('#sv');
  await p.waitForTimeout(500);
  ok((await Dm()).tasks.find(t => t.id === tid).ultKm === 120000, 'completar plan: «120.000» km se guardan como 120.000');
  // 9e) Salir de un viaje antes de que cargue el mapa no rompe nada
  const tr = (await Dm()).trips[0];
  await p.goto(BASE + '#/viaje/' + tr.id); await p.evaluate(() => (location.hash = '#/inicio')); await p.waitForTimeout(800);
  ok(await p.locator('#view .vh').count() === 1, 'salir rápido de un viaje deja la pantalla bien');
  // 9g) Borrar un viaje desde la lista (con pregunta y deshacer) y desde el propio viaje
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  const nT = (await Dm()).trips.length;
  await p.click('#view [data-del] >> nth=0'); await p.waitForTimeout(300);
  ok(await p.locator('.ask').count() === 1, 'borrar un viaje desde la lista pregunta antes');
  await p.click('.ask [data-ok]'); await p.waitForTimeout(500);
  ok((await Dm()).trips.length === nT - 1 && await p.locator('#view .trow').count() === nT - 1, 'viaje borrado desde la lista');
  await p.click('#undo button'); await p.waitForTimeout(500);
  ok((await Dm()).trips.length === nT && await p.locator('#view .trow').count() === nT, 'deshacer recupera el viaje');
  await p.click('#view .trow a >> nth=0'); await p.waitForTimeout(800);
  await p.click('#dtr'); await p.waitForTimeout(300); await p.click('.ask [data-ok]'); await p.waitForTimeout(600);
  ok(p.url().endsWith('#/viajes') && (await Dm()).trips.length === nT - 1, 'viaje borrado desde su pantalla y vuelta a la lista');
  // 9h) El mapa nunca queda por encima de las hojas, la cabecera ni la barra (Leaflet usa capas con z-index 400–1000)
  const trp = (await Dm()).trips[0];
  await p.goto(BASE + '#/viaje/' + trp.id); await p.waitForTimeout(500);
  await p.evaluate(() => { const m = document.querySelector('#map'); for (const z of [400, 800, 1000]) { const d = document.createElement('div'); d.className = 'fake-leaflet'; d.style.cssText = `position:absolute;inset:0;z-index:${z}`; m.appendChild(d); } });
  await p.click('#meta'); await p.waitForTimeout(400);
  const top = await p.evaluate(() => { const sh = document.querySelector('.sheet'), mp = document.querySelector('#map').getBoundingClientRect();
    const pts = [[mp.left + mp.width / 2, Math.max(mp.top + 10, 10)], [mp.left + mp.width / 2, Math.min(mp.bottom - 10, innerHeight - 10)]];
    return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !e.closest('#map') ? 'ok' : 'mapa'; }).join(','); });
  ok(!top.includes('mapa'), 'con un viaje abierto, la hoja «Datos» queda por encima del mapa (' + top + ')');
  await closeSheet();
  await p.evaluate(() => scrollTo(0, 120)); await p.waitForTimeout(200);
  const bars = await p.evaluate(() => [document.querySelector('header'), document.querySelector('#bb')].filter(e => e && e.offsetHeight).map(e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); return h && h.closest('#map') ? 'tapada' : 'ok'; }).join(','));
  ok(!bars.includes('tapada'), 'el mapa no tapa la cabecera ni la barra de abajo (' + bars + ')');

  // 9i) Cambiar de color cambia también el icono (cookie para el manifest e icono de iPhone)
  await p.goto(BASE + '#/ajustes/apariencia'); await p.waitForTimeout(300);
  await p.click('#sws [aria-label="Azul"]'); await p.waitForTimeout(300);
  const ic1 = await p.evaluate(() => [document.cookie, document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')]);
  ok(/cz_ic=azul/.test(ic1[0]) && ic1[1] === 'ic/azul-apple.png', 'color Azul: el icono de la app pasa a azul (' + ic1.join(' · ') + ')');
  await p.reload(); await p.waitForTimeout(500);
  ok((await p.evaluate(() => document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'))) === 'ic/azul-apple.png', 'el icono se mantiene al volver a abrir');
  await p.click('#sws [aria-label="Esmeralda"]'); await p.waitForTimeout(300);
  const ic2 = await p.evaluate(() => [document.cookie, document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')]);
  ok(!/cz_ic=[a-z]/.test(ic2[0]) && ic2[1] === 'icons/apple-touch-icon.png', 'volver a Esmeralda devuelve el icono de siempre');

  // 9f) Apariencia: sin vista previa redundante del tamaño de letra
  await p.goto(BASE + '#/ajustes/apariencia'); await p.waitForTimeout(300);
  ok(!(await p.innerText('#view')).includes('Vista previa'), 'tamaño del texto sin vista previa redundante');

  ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    await run(browser, 'Móvil', { width: 390, height: 844 }, true);
    await run(browser, 'PC', { width: 1280, height: 860 }, false);
  } catch (e) { ok(false, 'la prueba se interrumpió: ' + e.message.split('\n').slice(0, 6).join(' · ')); console.error(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
