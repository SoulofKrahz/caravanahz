// Prueba de coherencia de los gastos: un viaje de verdad apuntado desde la app (como lo haría la usuaria)
// y, después de cada cambio, se comprueba que TODAS las pantallas cuentan lo mismo que la suma hecha a mano:
// Inicio, Gastos (total y meses), Combustible, Estadísticas (total, grupos, gasóleo, viajes), el viaje y la lista de viajes.
// Uso: node tests/gastos.cjs   (PW_EXE=/ruta/chromium opcional)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), BASE = 'http://app.test/';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const fails = [];
let where = '';
const ok = (cond, msg) => { if (!cond) { fails.push(where + msg); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Coherencia de gastos::${where}${msg}`.replace(/\n/g, ' ')); } console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

// Formatos iguales que los de la app (es-ES, punto de miles siempre)
const nf0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const nf2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const E0 = n => nf0.format(n).replace(/ /g, ' '), E2 = n => nf2.format(n).replace(/ /g, ' ');
const clean = s => s.replace(/[  ]/g, ' ');
const sum = a => Math.round(a.reduce((s, e) => s + (+e.importe || 0), 0) * 100) / 100;

async function run(browser, label, viewport, mobile, simple) {
  console.log(`\n== ${label}`); where = label + ': ';
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', locale: 'es-ES', acceptDownloads: true });
  const p = await ctx.newPage(), errs = [];
  p.setDefaultTimeout(8000);
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) return r.abort();
    const rel = decodeURIComponent(new URL(u).pathname.slice(1));
    const f = path.join(SITE, rel || 'index.html');
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'no' });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const W = ms => p.waitForTimeout(ms);
  const save = async () => { await p.click('.sheet [data-save]'); await W(450); if (await p.locator('.ask').count()) { await p.click('.ask [data-ok]'); await W(450); } };
  const D = () => p.evaluate(async () => { const m = await import('./js/db.js'); return JSON.parse(JSON.stringify(m.D)); });
  const L = (fn, a) => p.evaluate(fn, a);
  const hoy = await (async () => { await p.goto(BASE); await W(600); return L(() => import('./js/logic.js').then(m => m.isoToday())); })();
  const dia = n => L(n => import('./js/logic.js').then(m => m.addDays(m.isoToday(), n)), n);
  const go = async h => { await p.goto(BASE + h); await W(450); };
  const txt = async sel => clean(await p.innerText(sel));
  const sheetOpen = async () => { await W(350); return p.locator('.sheet').count(); };
  const setFecha = async f => { await p.fill('.sheet [name=fecha]', f); await p.dispatchEvent('.sheet [name=fecha]', 'change'); };
  const openMore = async () => { const d = p.locator('.sheet details.more'); if (await d.count() && !(await d.evaluate(x => x.open))) await p.click('.sheet details.more > summary'); };

  // ---------- Configuración ----------
  await p.click('#go'); await W(300);
  await p.fill('[name=nombre]', 'La Tortuga'); await p.fill('[name=km]', '145.000'); await p.fill('[name=deposito]', '80').catch(() => {});
  await p.click('.sheet [data-save]'); await W(800);
  if (!simple) await L(() => import('./js/theme.js').then(m => m.savePrefs({ simple: false })));
  await L(() => import('./js/db.js').then(m => m.setKV('helpDone', true)));

  const fuel = async (f, litros, ppl, km, opt = {}) => {
    await go('#/inicio'); await p.click('#qf'); await sheetOpen();
    await setFecha(f); await p.fill('.sheet [name=litros]', litros); await p.fill('.sheet [name=ppl]', ppl); await p.fill('.sheet [name=km]', km);
    if (opt.concepto) await p.fill('.sheet [name=concepto]', opt.concepto);
    const note = (await p.locator('.sheet [data-trip]').isVisible()) ? await txt('.sheet [data-trip]') : '';
    await save(); return note;
  };
  const gasto = async (f, cat, importe, concepto, from = 'inicio') => {
    if (from === 'inicio') { await go('#/inicio'); await p.click('#qg'); } else { await p.click('#ga'); }
    await sheetOpen();
    await setFecha(f); await p.click(`.sheet .catp [data-c="${cat}"]`); await p.fill('.sheet [name=importe]', importe); await p.fill('.sheet [name=concepto]', concepto);
    const note = (await p.locator('.sheet [data-trip]').isVisible()) ? await txt('.sheet [data-trip]') : '';
    await save(); return note;
  };

  // ---------- Comprobación de todas las pantallas ----------
  const shot = async (h, name, sel) => { if (!process.env.SHOTS || !simple) return; await go(h); await W(300); if (sel) await p.locator(sel).scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
  const check = async (paso) => {
    const d = await D(), yr = hoy.slice(0, 4);
    const inY = d.expenses.filter(e => e.fecha.startsWith(yr));
    const tot = sum(inY), fuelY = sum(inY.filter(e => e.cat === 'Combustible'));
    const G = { Fijos: ['Seguro', 'Impuestos y tasas'], Uso: ['Combustible', 'Peajes', 'Área / camping', 'Ferry'], Mantenimiento: ['Mantenimiento'], 'Equipamiento y otros': ['Equipamiento', 'Otros'] };
    const bad = [];
    // Inicio
    await go('#/inicio');
    const ini = await txt('#view');
    if (simple && tot && !ini.includes(`llevas ${E0(tot)} gastados`)) bad.push(`Inicio no dice ${E0(tot)}`);
    // Gastos: total del año y cada mes
    await go('#/gastos/gastos');
    const kTot = await txt('.kpis .kpi >> nth=0');
    if (!kTot.includes(E0(tot))) bad.push(`Gastos: total ${kTot.split('\n')[1]} ≠ ${E0(tot)}`);
    const nRows = await p.locator('#view .erow').count();
    if (nRows !== inY.length) bad.push(`Gastos: ${nRows} filas ≠ ${inY.length} gastos`);
    for (const m of [...new Set(inY.map(e => e.fecha.slice(0, 7)))]) {
      const h = await txt(`.gh[data-m="${m}"]`).catch(() => '');
      const s = sum(inY.filter(e => e.fecha.startsWith(m)));
      if (!h.includes(E2(s))) bad.push(`Gastos: mes ${m} dice «${h.replace(/\n/g, ' ')}» ≠ ${E2(s)}`);
    }
    // Combustible
    await go('#/gastos/combustible');
    const kF = await txt('.kpis .kpi >> nth=0');
    if (!kF.includes(E0(fuelY))) bad.push(`Combustible: ${kF.split('\n')[1]} ≠ ${E0(fuelY)}`);
    // Estadísticas: total, grupos, gasóleo
    await go('#/stats');
    const st = await txt('#view');
    const kS = await txt('.kpis .kpi >> nth=0');
    if (!kS.includes(E0(tot))) bad.push(`Estadísticas: coste total ${kS.split('\n')[1]} ≠ ${E0(tot)}`);
    for (const [g, cats] of Object.entries(G)) {
      const v = sum(inY.filter(e => cats.includes(e.cat)));
      const row = await txt(`.legv > :has-text("${g}")`).catch(() => '');
      if (!row.includes(E0(v))) bad.push(`Estadísticas: grupo ${g} «${row.replace(/\n/g, ' ')}» ≠ ${E0(v)}`);
    }
    const stRows = {};
    for (const t of d.trips) stRows[t.id] = await txt(`.scard:has(h2:text-is("Viajes")) tr:has-text("${t.nombre}")`).catch(() => '');
    const gas = await txt('.scard:has(h2:text-is("Gasóleo")) .mini > :nth-child(1)').catch(() => '');
    if (!gas.includes(E0(fuelY))) bad.push(`Estadísticas: gasóleo gastado «${gas.replace(/\n/g, ' ')}» ≠ ${E0(fuelY)}`);
    // Cada viaje: su pantalla (lista y total pagado), la lista de viajes y la tabla de Estadísticas
    for (const t of d.trips) {
      const ex = d.expenses.filter(e => e.viajeId === t.id), paid = sum(ex);
      await go('#/viaje/' + t.id); await W(300);
      const n = await p.locator('#gl .erow').count();
      if (n !== ex.length) bad.push(`Viaje ${t.nombre}: ${n} gastos en su lista ≠ ${ex.length}`);
      const gl = await txt('#gl');
      if (ex.length && !gl.includes(E2(paid))) bad.push(`Viaje ${t.nombre}: no muestra lo pagado ${E2(paid)} («${gl.split('\n').slice(-4).join(' / ')}»)`);
      const cost = await L(id => Promise.all([import('./js/db.js'), import('./js/logic.js')]).then(([db, l]) => { const t = db.D.trips.find(x => x.id === id); return l.tripCost(t, db.D, l.eur100Of(db.D.expenses)); }), t.id);
      if (cost.total && !gl.includes(E2(cost.total))) bad.push(`Viaje ${t.nombre}: no muestra el coste ${E2(cost.total)}`);
      // Inicio: el viaje en curso dice lo que llevas gastado
      if (simple && paid && t.inicio <= hoy && !t.kmFin && !t.cerrado && !(t.fin && t.fin < hoy) && !ini.includes(`Llevas ${E2(paid)} gastados`)) bad.push(`Inicio: «Estás de viaje» no dice que llevas ${E2(paid)}`);
      if (t.inicio && t.inicio <= hoy) {
        const inStats = st.includes(t.nombre);
        if (!inStats) bad.push(`Estadísticas: el viaje ${t.nombre} no sale en «Viajes»`);
        else if (cost.total && !stRows[t.id].includes(E0(cost.total))) bad.push(`Estadísticas: coste del viaje ${t.nombre} ≠ ${E0(cost.total)}`);
      }
      await go('#/viajes');
      const row = await txt(`#view .trow:has-text("${t.nombre}")`).catch(() => '');
      if ((paid || cost.total) && !(row.includes(E0(cost.total)) || row.includes(E2(cost.total)) || row.includes(E2(paid)) || row.includes(E0(paid)))) bad.push(`Viajes: la fila de ${t.nombre} no enseña su coste («${row.replace(/\n/g, ' ')}»)`);
    }
    ok(!bad.length, `${paso}: todas las pantallas cuadran (año ${E2(tot)}, gasóleo ${E2(fuelY)}${d.trips.map(t => `, ${t.nombre} ${E2(sum(d.expenses.filter(e => e.viajeId === t.id)))}`).join('')})` + (bad.length ? '\n      - ' + bad.join('\n      - ') : ''));
  };

  // ---------- Antes del viaje ----------
  await fuel(await dia(-20), '60', '1,500', '145.100');
  await fuel(await dia(-10), '50', '1,600', '145.700');
  await gasto(await dia(-15), 'Seguro', '420', 'Mapfre anual');
  await gasto(await dia(-5), 'Equipamiento', '60', 'Calzos niveladores');
  await check('antes del viaje');

  // ---------- Salgo de viaje sin fecha de vuelta ----------
  await go('#/viajes'); await p.click('#add'); await sheetOpen();
  await p.fill('.sheet [name=nombre]', 'Asturias'); await p.fill('.sheet [name=inicio]', await dia(-3)); await save(); await W(800);
  const tid = p.url().split('/').pop();
  await p.click('#kmr [data-km=ini]'); await sheetOpen(); await p.fill('.sheet [name=km]', '145.800'); await save();
  ok(p.url().includes('#/viaje/') && (await txt('#tm')).includes('sin fecha de vuelta'), 'viaje Asturias en curso, sin fecha de vuelta');

  // Gastos de esos días, apuntados desde Inicio (como en el viaje)
  const n1 = await fuel(hoy, '40', '1,550', '146.300', { concepto: 'Repsol Llanes' });
  ok(n1.includes('Asturias'), 'repostaje desde Inicio: avisa de que va al viaje');
  const n2 = await gasto(await dia(-2), 'Área / camping', '15', 'Área de Cangas');
  const n3 = await gasto(await dia(-1), 'Peajes', '23,40', 'AP-66 Huerna');
  ok(n2.includes('Asturias') && n3.includes('Asturias'), 'área y peaje de días anteriores (dentro del viaje): van al viaje');
  await go('#/viaje/' + tid); await W(400);
  await gasto(await dia(-1), 'Ferry', '180', 'Ferry a Cudillero', 'viaje');
  // Una avería en el viaje, apuntada como revisión hecha con coste
  await go('#/inicio'); await p.click('#qm'); await sheetOpen();
  await p.click('.sheet [data-free]'); await sheetOpen();
  await p.fill('.sheet [name=nombre]', 'Cambio de escobillas'); await setFecha(await dia(-1));
  await p.fill('.sheet [name=coste]', '35'); await p.fill('.sheet [name=taller]', 'Talleres Llanes').catch(() => {});
  await save();
  const dm = await D();
  const sv = dm.expenses.find(e => e.cat === 'Mantenimiento' && +e.importe === 35);
  ok(!!sv, 'revisión hecha con coste: crea su gasto de Mantenimiento');
  ok(sv && sv.viajeId === tid, 'revisión hecha durante el viaje: su gasto cuenta en el viaje');
  await check('durante el viaje');
  await shot('#/inicio', 'v1_inicio'); await shot('#/viaje/' + tid, 'v2_viaje', '#gl'); await shot('#/viajes', 'v3_lista');

  // ---------- Del Resumen a la lista de apuntes (cada cifra tocable) ----------
  {
    await go('#/stats');
    const links = await p.$$eval('#view a[href^="#/apuntes/"]', as => as.map(a => ({ href: a.getAttribute('href'), txt: a.innerText.replace(/[  ]/g, ' ') })));
    ok(links.length >= 8, `el Resumen tiene ${links.length} cifras que llevan a sus apuntes (total, por km, al mes, grupos, categorías, meses, gasóleo, zonas)`);
    const bad = [], seen = new Set();
    for (const l of links) {
      if (seen.has(l.href)) continue; seen.add(l.href);
      const q = new URLSearchParams(decodeURIComponent(l.href.split('/apuntes/')[1]));
      const d = await D(), f = q.get('f'), t = q.get('t'), cats = (q.get('c') || '').split('|').filter(Boolean);
      const exp = q.get('k') === 'revis'
        ? d.services.filter(x => x.fecha >= f && x.fecha <= t && +x.coste > 0 && (x.zona || 'Otros') === q.get('z')).reduce((a, x) => a + +x.coste, 0)
        : sum(d.expenses.filter(e => e.fecha >= f && e.fecha <= t && (!cats.length || cats.includes(e.cat))));
      const n = q.get('k') === 'revis' ? d.services.filter(x => x.fecha >= f && x.fecha <= t && +x.coste > 0 && (x.zona || 'Otros') === q.get('z')).length : d.expenses.filter(e => e.fecha >= f && e.fecha <= t && (!cats.length || cats.includes(e.cat))).length;
      await p.goto(BASE + l.href); await W(350);
      const tot = await txt('.kpis .kpi >> nth=0'), rows = await p.locator('#view .list > .erow, #view .list > [data-s]').count();
      // la cifra del Resumen (redondeada al euro) es la de la lista
      const shownInStats = (l.txt.match(/[\d.]+(,\d+)?\s*€/) || [''])[0];
      if (!tot.includes(E2(exp)) || rows !== n) bad.push(`«${q.get('tit')}»: lista ${tot.split('\n')[1]} en ${rows} filas; esperaba ${E2(exp)} en ${n}`);
      else if (shownInStats && !/^(Por kil|Al mes)/.test(l.txt) && !l.txt.includes(E0(exp)) && !/\d{4}$/.test(q.get('tit') || '')) bad.push(`«${q.get('tit')}»: el Resumen dice ${shownInStats} y la lista ${E2(exp)}`);
    }
    ok(!bad.length, `cada lista suma lo mismo que su cifra del Resumen (${seen.size} listas)` + (bad.length ? '\n      - ' + bad.join('\n      - ') : ''));
    // Tocar un apunte abre su ficha; corregirlo cambia la lista y el Resumen; Atrás vuelve al Resumen
    await go('#/stats');
    await p.click('#view .legv a.tap:has-text("Uso")'); await W(400);
    ok(p.url().includes('#/apuntes/') && (await txt('#view h1')) === 'Uso', 'tocar «Uso» en el Resumen abre su lista de apuntes');
    if (process.env.SHOTS && simple) { await p.screenshot({ path: path.join(process.env.SHOTS, 'ap_lista.png') }); await go('#/stats'); await p.screenshot({ path: path.join(process.env.SHOTS, 'ap_resumen1.png') }); await p.locator('.legv').scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(process.env.SHOTS, 'ap_resumen2.png') }); await p.click('#view .legv a.tap:has-text("Uso")'); await W(400); }
    await p.click('#view .erow:has-text("AP-66") [data-e]'); await sheetOpen();
    { const v = await p.locator('.sheet [name=importe]').inputValue(); ok(/^23,40?$/.test(v) && (await p.inputValue('.sheet [name=concepto]')).includes('AP-66'), 'tocar un apunte abre su ficha exacta (el peaje de 23,40 €): ' + v); }
    await p.fill('.sheet [name=importe]', '24'); await save();
    const d2 = await D(), uso = sum(d2.expenses.filter(e => e.fecha.startsWith(hoy.slice(0, 4)) && ['Combustible', 'Peajes', 'Área / camping', 'Ferry'].includes(e.cat)));
    ok((await txt('.kpis .kpi >> nth=0')).includes(E2(uso)), 'tras corregirlo, la lista se recalcula al momento (' + E2(uso) + ')');
    await p.evaluate(() => history.back()); await W(500);
    ok(p.url().endsWith('#/stats') && (await txt('.legv a.tap:has-text("Uso")')).includes(E0(uso)), 'Atrás vuelve al Resumen, ya actualizado');
    await p.click('#view .legv a.tap:has-text("Uso")'); await W(400);
    await p.click('#view a.back'); await W(400);
    ok(p.url().endsWith('#/stats'), '«Volver» también vuelve al Resumen');
    // devolver el peaje a 23,40 para que el resto de la prueba siga igual
    await go('#/gastos/gastos'); await p.click('#view .erow:has-text("AP-66") [data-e]'); await sheetOpen(); await p.fill('.sheet [name=importe]', '23,40'); await save();
    // Borrar desde la lista de apuntes (papelera) y deshacer
    await go('#/stats'); await p.click('#view .hbars a.hb.tap:has-text("Ferry")'); await W(400);
    await p.click('#view .erow [data-dx]'); await W(300); await p.click('.ask [data-ok]'); await W(500);
    ok(await p.locator('#view .erow').count() === 0 && (await txt('#view')).includes('No hay apuntes'), 'borrar el único apunte de la lista: «No hay apuntes»');
    await p.click('#undo button'); await W(500);
    ok(await p.locator('#view .erow').count() === 1, 'deshacer lo devuelve a la lista');
  }

  // ---------- Cambios ----------
  // a) corrijo el peaje desde la lista del viaje
  await go('#/viaje/' + tid); await W(400);
  await p.click('#gl .erow:has-text("AP-66") [data-e]'); await sheetOpen();
  await p.fill('.sheet [name=importe]', '25'); await save();
  await check('peaje corregido a 25 €');
  // b) los calzos (de antes del viaje) los paso al viaje
  await go('#/gastos/gastos');
  await p.click('#view .erow:has-text("Calzos") [data-e]'); await sheetOpen(); await openMore();
  await p.selectOption('.sheet [name=viajeId]', tid); await save();
  ok((await D()).expenses.find(e => e.concepto === 'Calzos niveladores').viajeId === tid, 'gasto asignado a mano al viaje');
  await check('calzos pasados al viaje');
  // c) borro el área con la papelera y la recupero con «Deshacer»
  await go('#/gastos/gastos');
  await p.click('#view .erow:has-text("Cangas") [data-dx]'); await W(300); await p.click('.ask [data-ok]'); await W(500);
  await check('área borrada');
  await p.click('#undo button'); await W(500);
  ok((await D()).expenses.some(e => e.concepto === 'Área de Cangas' && e.viajeId === tid), 'deshacer: el área vuelve y sigue en el viaje');
  await check('área recuperada');
  // d) borro el gasto de la avería: la revisión queda sin coste
  await go('#/viaje/' + tid); await W(400);
  await p.click('#gl .erow:has-text("escobillas") [data-dx]'); await W(300); await p.click('.ask [data-ok]'); await W(500);
  const sv2 = (await D()).services.find(s => s.id === sv.servicioId);
  ok(sv2 && !+sv2.coste, 'borrar el gasto de una revisión: la revisión queda sin coste (no cuenta dos veces)');
  await check('gasto de la avería borrado');

  // e) vuelvo a poner coste a la revisión (que se quedó sin él): se crea su gasto y va al viaje
  await go('#/mant'); await p.click('#seg [data-v="hist"]'); await W(400);
  await p.click('#view [data-h]:has-text("escobillas"), #view [data-h]:has-text("Llanes")'); await sheetOpen();
  await p.fill('.sheet [name=coste]', '40'); await save();
  { const d = await D(), g = d.expenses.find(e => e.servicioId && +e.importe === 40);
    ok(!!g && g.viajeId === tid, 'poner coste a una revisión que no lo tenía: crea su gasto (en el viaje)'); }
  await check('coste de la revisión puesto (40 €)');
  // f) cambio el coste desde la revisión: el gasto cambia con él
  await go('#/mant'); await p.click('#seg [data-v="hist"]'); await W(400);
  await p.click('#view [data-h]:has-text("escobillas"), #view [data-h]:has-text("Llanes")'); await sheetOpen();
  await p.fill('.sheet [name=coste]', '38,50'); await save();
  ok((await D()).expenses.some(e => e.servicioId && +e.importe === 38.5), 'cambiar el coste de la revisión cambia su gasto');
  await check('coste de la revisión cambiado (38,50 €)');
  // g) el ITV renovado con gasto: cuenta en los gastos fijos, no en el viaje
  await go('#/gastos/docs'); await p.click('#view #add'); await sheetOpen();
  await p.selectOption('.sheet [name=tipo]', 'ITV'); await p.fill('.sheet [name=vence]', await dia(20)); await save();
  await go('#/gastos/docs'); await p.click('#view [data-d]'); await sheetOpen();
  await p.click('.sheet [data-ren]'); await sheetOpen();
  await p.fill('.sheet [name=importe]', '45,60'); await save();
  { const g = (await D()).expenses.find(e => e.cat === 'Impuestos y tasas' && +e.importe === 45.6);
    ok(!!g && !g.viajeId, 'renovar la ITV con importe: gasto en «Impuestos y tasas», fuera del viaje'); }
  await check('ITV renovada');
  // i) coste de la «última vez» de una tarea (Editar tarea): va al historial y a Gastos
  await go('#/mant'); await p.click('#seg [data-v="plan"]').catch(() => {}); await W(300);
  await p.click('#view :is(button,a,[data-t]):has-text("Extintor")'); await sheetOpen();
  await p.click('.sheet [data-e]'); await sheetOpen();
  ok(await p.locator('.sheet [name=ultCoste]').count() === 1, 'Editar tarea: la «última vez» tiene campo de coste');
  await p.fill('.sheet [name=ultFecha]', await dia(-40)); await p.fill('.sheet [name=ultCoste]', '45,90'); await save();
  { const d = await D(), t = d.tasks.find(x => x.nombre === 'Extintor'), sv = d.services.find(x => x.tareaId === t.id);
    const g = sv && d.expenses.find(e => e.id === sv.gastoId);
    ok(!!sv && +sv.coste === 45.9 && g && g.cat === 'Mantenimiento' && +g.importe === 45.9 && !g.viajeId && t.ultFecha === sv.fecha, 'extintor: registro en su historial y gasto de 45,90 € en Mantenimiento (fuera del viaje)'); }
  await check('extintor con coste');
  // j) coste en «Completar plan»
  await go('#/mant/completar');
  const row = p.locator('#cl [data-id]:has-text("Manguitos")');
  ok(await row.locator('[data-c]').count() === 1, 'Completar plan: cada tarea tiene casilla de coste');
  await row.locator('[data-f]').fill(await dia(-30)); await row.locator('[data-c]').fill('1.234,50');
  await p.click('#sv'); await W(600);
  { const d = await D(), t = d.tasks.find(x => /Manguitos/.test(x.nombre)), sv = d.services.find(x => x.tareaId === t.id);
    ok(!!sv && +sv.coste === 1234.5 && d.expenses.some(e => e.id === sv.gastoId && e.cat === 'Mantenimiento' && +e.importe === 1234.5) && t.ultFecha === sv.fecha, `manguitos: registro y gasto de 1.234,50 € desde Completar plan (${sv && sv.coste})`); }
  await check('manguitos con coste');

  // h) el CSV suma lo mismo que la app
  await go('#/gastos/gastos');
  { const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split('\r\n').slice(1);
    const tCsv = Math.round(csv.reduce((a, l) => a + +(l.split(';')[3] || '0').replace(',', '.'), 0) * 100) / 100;
    const d = await D();
    ok(csv.length === d.expenses.length && tCsv === sum(d.expenses), `el CSV tiene los ${d.expenses.length} gastos y suma lo mismo (${E2(tCsv)})`);
    const enV = csv.filter(l => l.includes(';Asturias;')).length;
    ok(enV === d.expenses.filter(e => e.viajeId === tid).length, 'el CSV indica el viaje de cada gasto'); }

  // ---------- Vuelvo ----------
  await go('#/inicio'); await p.click('#hv'); await sheetOpen();
  await p.fill('.sheet [name=km]', '146.900'); await save();
  ok((await D()).trips.find(t => t.id === tid).kmFin === 146900, '«He vuelto» con 1.100 km recorridos');
  await check('de vuelta');
  await shot('#/viaje/' + tid, 'v4_vuelta', '#gl'); await shot('#/stats', 'v5_stats', '.scard:has(h2:text-is("Viajes"))');

  // ---------- Borro el viaje con sus gastos y lo recupero ----------
  await go('#/viaje/' + tid); await W(400);
  await p.click('#dtr'); await W(300); await p.click('.ask [data-ok]'); await W(700);
  ok(!(await D()).expenses.some(e => e.viajeId === tid) && !(await D()).trips.length, 'viaje y sus gastos borrados');
  await check('viaje borrado con sus gastos');
  await go('#/viajes'); await p.click('#undo button').catch(() => {}); await W(700);
  await check('viaje recuperado con «Deshacer»');

  // ---------- Copia de seguridad: guardar y restaurar deja todo igual ----------
  const before = await D();
  await go('#/ajustes/copia');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#view button:has-text("Guardar")').catch(() => p.click('#bk'))]);
  const file = await dl.path();
  await L(() => import('./js/db.js').then(m => m.wipe()));
  await go('#/ajustes/copia');
  await p.setInputFiles('#view input[type=file]', file); await W(600);
  if (await p.locator('.ask').count()) { await p.click('.ask [data-ok]'); await W(900); }
  const after = await D();
  ok(after.expenses.length === before.expenses.length && sum(after.expenses) === sum(before.expenses) && after.trips.length === before.trips.length, 'restaurar la copia devuelve los mismos gastos y viajes');
  await check('tras restaurar la copia');

  ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    await run(browser, 'Móvil · modo sencillo', { width: 390, height: 844 }, true, true);
    await run(browser, 'PC · modo completo', { width: 1280, height: 860 }, false, false);
  } catch (e) { ok(false, 'la prueba se interrumpió: ' + e.message.split('\n').slice(0, 6).join(' · ')); console.error(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
