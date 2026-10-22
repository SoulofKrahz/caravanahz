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
  await ctx.route('**/*', r => {
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

  // 4c) Inicio enseña el próximo viaje con fecha aunque haya otro sin fecha (antes este le quitaba el sitio)
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300); await p.fill('.sheet [name=nombre]', 'Sin fecha aún'); await save(); await p.waitForTimeout(900);
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  const vi = await p.innerText('.sec:has(h2:has-text("Viajes"))');
  ok(vi.includes('Picos') && /Próximo · sales en/.test(vi) && vi.includes('1 viaje sin fecha'), 'Inicio: el próximo viaje con fecha sale aunque haya uno sin fecha');

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
  await p.click('.sheet .catp [data-c="Mantenimiento"]'); await p.fill('.sheet [name=importe]', '1.234'); await save();
  ok((await Dm()).expenses.some(e => e.importe === 1234), 'importe «1.234» se guarda como 1.234 €');
  // 9b2) Todas las categorías a la vista: un gasto de Equipamiento desde «Otro gasto» y aparece en Estadísticas
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  await p.click(mobile ? '#qg' : '#qg'); await p.waitForTimeout(300);
  ok(await p.locator('.sheet .catp [data-c]').count() === 9 && await p.locator('.sheet .catp [data-c="Equipamiento"]').isVisible() && await p.locator('.sheet .catp [data-c="Otros"]').isVisible(), 'las 9 categorías se ven como botones (Equipamiento y Otros incluidos)');
  await p.click('.sheet .catp [data-c="Equipamiento"]'); await p.waitForTimeout(100);
  ok((await p.getAttribute('.sheet [name=concepto]', 'placeholder')).includes('toldo') && await p.locator('.sheet .catp .on').count() === 1, 'al elegir Equipamiento se marca y el concepto da ejemplos');
  await p.fill('.sheet [name=importe]', '320'); await p.fill('.sheet [name=concepto]', 'Toldo nuevo'); await save();
  ok((await Dm()).expenses.some(e => e.cat === 'Equipamiento' && e.importe === 320), 'gasto de Equipamiento guardado');
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok((await p.innerText('#view')).replace(/\u00a0/g, ' ').match(/Equipamiento y otros[\s\S]{0,80}320 €/), 'Estadísticas: «Equipamiento y otros» suma el gasto');
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

  // 10) Viaje sin fecha de vuelta: se sale sin saber cuándo se vuelve y todo sigue funcionando
  const L = (fn, arg) => p.evaluate(fn, arg);
  const hoy = await L(() => import('./js/logic.js').then(m => m.isoToday()));
  const diasAtras = n => L(n => import('./js/logic.js').then(m => m.addDays(m.isoToday(), -n)), n);
  const txt = async sel => (await p.innerText(sel)).replace(/ /g, ' ');
  // 10a) Crear el viaje saliendo hoy, sin vuelta
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Ruta abierta'); await p.fill('.sheet [name=inicio]', hoy); await save(); await p.waitForTimeout(1000);
  ok(p.url().includes('#/viaje/') && (await txt('#tm')).includes('sin fecha de vuelta'), 'abierto: se crea saliendo hoy sin fecha de vuelta');
  const rid = p.url().split('/').pop();
  await p.click('#kmr [data-km=ini]'); await p.waitForTimeout(300); await p.fill('.sheet [name=km]', '147.500'); await save();
  ok((await txt('#kmr')).includes('Sin fecha de vuelta'), 'abierto: con km de salida, «Al volver» espera a que llegues');
  // 10b) Inicio: aviso «Estás de viaje» con «He vuelto», sin preguntar si ya has vuelto
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  let ini = await txt('#view');
  ok(ini.includes('Estás de viaje: Ruta abierta') && await p.locator('#hv').count() === 1 && !ini.includes('¿Ya has vuelto'), 'abierto: Inicio dice «Estás de viaje» con botón «He vuelto»');
  ok(/Ruta abierta\s*En curso · desde el .*sin fecha de vuelta/.test(ini), 'abierto: Inicio lo pone «En curso»');
  // 10c) Un repostaje apuntado desde Inicio va solo al viaje
  if (mobile) { await p.click('#qf'); } else { await p.click('#qf'); }
  await p.waitForTimeout(300);
  ok((await txt('.sheet [data-trip]')).includes('Ruta abierta'), 'abierto: el repostaje nuevo dice que se apunta en el viaje');
  await p.fill('.sheet [name=litros]', '30'); await p.fill('.sheet [name=ppl]', '1,6'); await p.fill('.sheet [name=km]', '147.700'); await save();
  ok((await Dm()).expenses.some(e => e.km === 147700 && e.viajeId === rid), 'abierto: el repostaje queda asignado al viaje');
  // 10d) Pasan los días (se simula moviendo la salida 5 días atrás): sigue en curso, no «hecho»
  const hace5 = await diasAtras(5);
  await L(async ([id, f]) => { const db = await import('./js/db.js'); const t = db.D.trips.find(x => x.id === id); t.inicio = f; await db.put('trips', t); }, [rid, hace5]);
  // y los km de salida de hace 5 días no pueden ser más que los de hoy: se ajustan a uno anterior al repostaje
  await L(async id => { const db = await import('./js/db.js'); const t = db.D.trips.find(x => x.id === id); t.kmIni = 147100; await db.put('trips', t); }, rid);
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(400);
  const lv = await txt('#view');
  ok(lv.indexOf('Ruta abierta') > -1 && (lv.indexOf('Hechos') < 0 || lv.indexOf('Ruta abierta') < lv.indexOf('Hechos')) && lv.includes('de viaje, sin fecha de vuelta'), 'abierto: a los 5 días sigue en «Próximos y en curso» (antes pasaba a «Hechos»)');
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  ok((await txt('.banner:has(#hv)')).includes('(llevas 5 noches)'), 'abierto: Inicio cuenta las noches que llevas fuera (5)');
  // 10e) Un gasto de hace 3 días también va al viaje; uno de hace 10 días, no
  await p.click('#qg'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=fecha]', await diasAtras(3)); await p.dispatchEvent('.sheet [name=fecha]', 'change'); await p.waitForTimeout(100);
  ok((await txt('.sheet [data-trip]')).includes('Ruta abierta'), 'abierto: un gasto de hace 3 días se apunta en el viaje');
  await p.fill('.sheet [name=fecha]', await diasAtras(10)); await p.dispatchEvent('.sheet [name=fecha]', 'change'); await p.waitForTimeout(100);
  ok(await p.locator('.sheet [data-trip]').isHidden(), 'abierto: un gasto de antes de salir no se apunta en el viaje');
  await p.fill('.sheet [name=fecha]', await diasAtras(3)); await p.dispatchEvent('.sheet [name=fecha]', 'change');
  await p.fill('.sheet [name=importe]', '18'); await p.fill('.sheet [name=concepto]', 'Área de Cangas'); await save();
  // 10f) Estadísticas: cuenta las noches del viaje en curso; el viaje aún no está entre los terminados
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok(await p.locator('.kpis').count() === 1, 'abierto: Estadísticas se abre con un viaje en curso');
  // 10g) «He vuelto» desde Inicio: fecha de hoy y km obligatorios (hay km de salida)
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  await p.click('#hv'); await p.waitForTimeout(300);
  ok((await p.inputValue('.sheet [name=fin]')) === hoy, '«He vuelto»: la fecha de vuelta viene puesta con hoy');
  await save();
  ok((await errsIn()).some(t => t.includes('km')), '«He vuelto»: con km de salida, pide los de vuelta');
  await p.fill('.sheet [name=km]', '148.300'); await save();
  ok(await p.locator('.sheet').count() === 0 && !(await txt('#view')).includes('Estás de viaje'), '«He vuelto»: viaje cerrado y desaparece el aviso');
  await p.goto(BASE + '#/viaje/' + rid); await p.waitForTimeout(600);
  { const k = await txt('#kmr'), m = await txt('#tm'); ok(k.includes('1.200 km recorridos') && m.includes('5 noches'), 'cerrado: 1.200 km recorridos y 5 noches' + (k.includes('1.200 km recorridos') && m.includes('5 noches') ? '' : ` [${k.replace(/\n/g, ' / ')} | ${m}]`)); }
  ok((await txt('#gl')).includes('Área de Cangas'), 'cerrado: los gastos del viaje están en su lista');
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  const lv2 = await txt('#view');
  ok(lv2.indexOf('Ruta abierta') > lv2.indexOf('Hechos'), 'cerrado: pasa a «Hechos»');
  // 10h) Viaje sin km de salida, con salida ya pasada: pregunta «¿Sigues de viaje?»
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Escapada sin km'); await p.fill('.sheet [name=inicio]', await diasAtras(2)); await save();
  ok(await p.locator('.ask').count() === 1 && (await txt('.ask')).includes('¿Sigues de viaje?'), 'salida pasada sin vuelta: pregunta «¿Sigues de viaje?»');
  await p.click('.ask [data-no]'); await p.waitForTimeout(300);
  ok(await p.locator('.sheet').count() === 1 && await p.evaluate(() => document.activeElement && document.activeElement.name === 'fin'), '«Ya volví»: se queda en el formulario con el cursor en la vuelta');
  await p.click('.sheet [data-save]'); await p.waitForTimeout(300); await p.click('.ask [data-ok]'); await p.waitForTimeout(1200);
  const eid = p.url().split('/').pop();
  ok(p.url().includes('#/viaje/') && (await txt('#kmr')).includes('He vuelto'), '«Sí, sigo de viaje»: viaje abierto, con «He vuelto» aunque no haya km de salida');
  await p.click('#kmr [data-km=fin]'); await p.waitForTimeout(300);
  ok((await txt('.sheet')).includes('opcional'), '«He vuelto» sin km de salida: los km son opcionales');
  await save();
  ok(await p.locator('.sheet').count() === 0 && (await txt('#kmr')).includes('Volviste el'), 'se cierra sin km: «Volviste el…»');
  ok((await Dm()).trips.find(t => t.id === eid).fin === hoy, 'la fecha de vuelta queda guardada');
  // 10i) Al día siguiente no vuelve a preguntar «¿Has salido?» por un viaje ya cerrado sin km
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  ok(!(await txt('#view')).includes('Escapada sin km?'), 'viaje cerrado sin km: Inicio no pregunta por él');
  // 10j) Poner una vuelta futura y quitarla: «vuelves en…» y vuelve a preguntar si sigues de viaje
  await p.goto(BASE + '#/viaje/' + eid); await p.waitForTimeout(500);
  await p.click('#meta'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=fin]', ''); await save();
  ok(await p.locator('.ask').count() === 1, 'quitar la vuelta de un viaje pasado pregunta si sigues de viaje');
  await p.click('.ask [data-ok]'); await p.waitForTimeout(500);
  ok((await txt('#tm')).includes('sin fecha de vuelta'), 'quitada la vuelta, el viaje vuelve a estar en curso');
  // 10k) Vuelta prevista para dentro de 3 días pero vuelves antes: «He vuelto» desde Inicio lo cierra hoy
  await L(async id => { const db = await import('./js/db.js'); const t = db.D.trips.find(x => x.id === id); t.cerrado = true; t.fin = t.inicio; await db.put('trips', t); }, eid); // cierra el anterior
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Vuelta prevista'); await p.fill('.sheet [name=inicio]', await diasAtras(2));
  await p.fill('.sheet [name=fin]', await L(() => import('./js/logic.js').then(m => m.addDays(m.isoToday(), 3)))); await save(); await p.waitForTimeout(1000);
  ok(await p.locator('.ask').count() === 0 && p.url().includes('#/viaje/'), 'con vuelta prevista no pregunta «¿Sigues de viaje?»');
  const vid = p.url().split('/').pop();
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
  ok((await txt('.banner:has(#hv)')).includes('Vuelta prevista') && (await txt('.banner:has(#hv)')).includes('Vuelves el'), 'en curso con vuelta prevista: Inicio dice cuándo vuelves y ofrece «He vuelto»');
  await p.click('#hv'); await p.waitForTimeout(300); await save();
  const vt = (await Dm()).trips.find(t => t.id === vid);
  ok(vt.fin === hoy && vt.cerrado && await p.locator('#hv').count() === 0, 'vuelves antes: el viaje se cierra con la fecha de hoy');

  // 11) Botón Atrás como en Android: las pantallas principales no se apilan; en Inicio, dos veces para salir
  {
    const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto(BASE + '#/inicio'); await q.waitForTimeout(600);
    const back = async () => { await q.evaluate(() => history.back()); await q.waitForTimeout(450); };
    const at = () => q.evaluate(() => location.hash);
    const navTo = async k => { await q.click(mobile ? `#bb a[href="#/${k}"]` : `#topnav a[href="#/${k}"]`); await q.waitForTimeout(350); };
    await navTo('gastos');
    await q.reload(); await q.waitForTimeout(700); // como al aplicar una actualización
    await navTo('viajes');
    await q.click('#view .trow a >> nth=0'); await q.waitForTimeout(700);
    ok((await at()).startsWith('#/viaje/'), 'Atrás: abierto un viaje desde Viajes');
    await back(); ok(await at() === '#/viajes', 'Atrás desde un viaje vuelve a la lista de Viajes');
    await back(); ok(await at() === '#/inicio', 'Atrás desde Viajes va a Inicio (no recorre Gastos)');
    await back();
    ok(await at() === '#/inicio' && (await q.innerText('#toast')).includes('Pulsa atrás otra vez para salir'), 'Atrás en Inicio: «Pulsa atrás otra vez para salir» y sigue en la app');
    await q.waitForTimeout(3300);
    await back(); ok(await at() === '#/inicio', 'pasados 3 s, Atrás vuelve a avisar (no sale por sorpresa)');
    // Durante el aviso se abre un formulario y se cierra con Atrás: el aviso se anula y la app no se cierra
    await q.click('#qf'); await q.waitForTimeout(300); await back();
    ok(await q.locator('.sheet').count() === 0 && await at() === '#/inicio', 'con un formulario abierto, Atrás lo cierra');
    await back();
    ok(q.url().startsWith(BASE) && (await q.innerText('#toast')).includes('para salir'), 'tras cerrar el formulario, Atrás vuelve a avisar en vez de salir');
    await q.evaluate(() => history.back()).catch(() => {}); await q.waitForTimeout(800);
    ok(!q.url().startsWith(BASE), 'dos veces Atrás seguidas en Inicio: sale de la app (' + q.url().slice(0, 30) + ')');
    await q.close();
  }

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
