// Prueba de humo de Caravanahz: arranca la app en un navegador real (móvil y PC) y comprueba que lo
// principal funciona. Si algo falla, el flujo de GitHub NO publica.
// Uso: node tests/smoke.cjs   (PW_EXE=/ruta/chromium opcional)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), BASE = 'http://app.test/';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };
const iso = d => d.toISOString().slice(0, 10);
const today = new Date(), ayer = new Date(Date.now() - 864e5);

async function run(browser, label, viewport, mobile) {
  console.log(`\n== ${label}`);
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

  // 1) Primera visita: bienvenida y configuración con validación
  await p.goto(BASE); await p.waitForTimeout(800);
  ok(await p.locator('#go').count() === 1, 'primera visita muestra la bienvenida');
  await p.click('#go'); await p.waitForTimeout(300);
  ok((await p.inputValue('[name=marca]')).startsWith('Fiat Ducato'), 'vehículo con la Ducato prerrellenada');
  await save();
  ok((await p.locator('.sheet .fld.bad').count()) >= 2, 'no deja guardar sin nombre ni km');
  await p.fill('[name=nombre]', 'Prueba'); await p.fill('[name=km]', '145.000'); await p.fill('[name=fechaMat]', '1999-04-15');
  await save(); await p.waitForTimeout(400);
  ok(p.url().includes('#/mant/completar'), 'tras configurar va a completar el plan');
  ok(await p.locator('#cl [data-id]').count() > 20, 'plan de mantenimiento del Ducato cargado');

  // 2) Repostaje: coma decimal y cálculo del importe
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(400);
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
  ok(fuel.includes('8 L/100 km') && fuel.includes('12,00 €'), 'consumo (8 L/100) y coste cada 100 km (12 €)');

  // 3) Km que bajan: rechazados
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  await p.click('#km'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=km]', '140000'); await save();
  ok((await errsIn()).some(t => t.includes('no puede bajar')), 'el cuentakilómetros no puede bajar');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // 4) Viaje: la vuelta no puede ser antes de la salida
  await p.goto(BASE + '#/viajes'); await p.waitForTimeout(300);
  await p.click('#add'); await p.waitForTimeout(300);
  await p.fill('.sheet [name=nombre]', 'Picos'); await p.fill('.sheet [name=inicio]', '2030-06-10'); await p.fill('.sheet [name=fin]', '2030-06-05');
  await save();
  ok((await errsIn()).some(t => t.includes('antes de la salida')), 'vuelta anterior a la salida rechazada');
  await p.fill('.sheet [name=fin]', '2030-06-15'); await save(); await p.waitForTimeout(1200);
  ok(p.url().includes('#/viaje/'), 'viaje creado y editor abierto (sin mapa: sin red)');

  // 5) Mantenimiento hecho desde el botón + (móvil) o desde Inicio
  await p.goto(BASE + '#/inicio'); await p.waitForTimeout(300);
  if (mobile) { await p.click('#fab'); await p.waitForTimeout(300); await p.click('.qa button >> nth=2'); }
  else await p.click('#qm');
  await p.waitForTimeout(400);
  await p.fill('#pq', 'aceite'); await p.click('#pl [data-t]:visible >> nth=0'); await p.waitForTimeout(400);
  await p.fill('.sheet [name=coste]', '145'); await save();
  ok(await p.locator('.sheet').count() === 0, 'mantenimiento registrado (y su gasto)');

  // 6) Todas las pantallas se pintan sin errores ni desbordes
  for (const u of ['#/inicio', '#/mant', '#/viajes', '#/gastos/gastos', '#/gastos/combustible', '#/gastos/docs', '#/stats', '#/ajustes/vehiculo', '#/ajustes/apariencia', '#/ajustes/avisos', '#/ajustes/viajes', '#/ajustes/copia', '#/ajustes/avanzado']) {
    await p.goto(BASE + u); await p.waitForTimeout(350);
    const bad = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || !document.querySelector('#view .vh, #view .empty'));
    if (bad) ok(false, 'pantalla ' + u + ' se pinta bien y sin desbordar');
  }
  ok(true, 'las 13 pantallas revisadas');
  await p.goto(BASE + '#/stats'); await p.waitForTimeout(400);
  ok(await p.locator('.kpis.k3 .kpi').count() === 6 && await p.locator('.sbars .c').count() >= 1, 'estadísticas con indicadores y gráfico');

  // 7) Copia de seguridad: se descarga un JSON válido
  await p.goto(BASE + '#/ajustes/copia'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bx')]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok(j.app === 'caravanahz' && j.data.expenses.length >= 3, 'copia de seguridad descargada con los datos');

  // 8) Tema oscuro y color se aplican
  await p.goto(BASE + '#/ajustes/apariencia'); await p.waitForTimeout(300);
  await p.click('[data-pref=theme] [data-v=dark]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'tema oscuro');

  ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    await run(browser, 'Móvil', { width: 390, height: 844 }, true);
    await run(browser, 'PC', { width: 1280, height: 860 }, false);
  } catch (e) { fails.push('la prueba se interrumpió: ' + e.message); console.error(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
