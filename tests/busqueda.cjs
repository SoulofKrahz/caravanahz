// Prueba del buscador de direcciones de los viajes. Los servicios (Photon y Nominatim) se simulan con respuestas
// en su formato real: se comprueba qué se les pide (dirección limpia), cómo se juntan los resultados y los planes
// de respaldo cuando una dirección no aparece tal cual.
// Uso: node tests/busqueda.cjs   (PW_EXE=/ruta/chromium opcional)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), BASE = 'http://app.test/';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); if (process.env.GITHUB_ACTIONS) console.log(`::error title=Buscador::${msg}`.replace(/\n/g, ' ')); } console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

// Datos simulados (formato real de cada servicio)
const nomi = (name, road, num, town, lat, lon, type = 'house') => ({ lat: String(lat), lon: String(lon), name, type, display_name: [name, road && (road + (num ? ' ' + num : '')), town, 'Asturias', 'España'].filter(Boolean).join(', '), address: { road, house_number: num, town, state: 'Asturias', country: 'España', country_code: 'es' } });
const pho = (name, street, num, city, lat, lon) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name, street, housenumber: num, city, state: 'Asturias', country: 'España', countrycode: 'ES' } });
const DB = {
  // La calle existe, pero su número 5 no está en el mapa (lo normal en muchos pueblos)
  'calle mayor, llanes': { n: [nomi('', 'Calle Mayor', '', 'Llanes', 43.4196, -4.7553, 'residential')], p: [pho('Calle Mayor', '', '', 'Llanes', 43.4197, -4.7554)] },
  'llanes': { n: [nomi('Llanes', '', '', '', 43.4199, -4.7552, 'town')], p: [pho('Llanes', '', '', '', 43.42, -4.755), pho('Llanes', '', '', 'Sobrescobio', 43.27, -5.48)] },
  // Con errata: Nominatim no encuentra nada, Photon sí
  'area autocaravanas lanes': { n: [], p: [pho('Área de autocaravanas de Llanes', 'Calle La Moría', '', 'Llanes', 43.418, -4.762)] },
  // Photon encuentra la calle pero no el portal (Nominatim nada): se enseña la calle avisando
  'calle del muelle 3, llanes': { n: [], p: [pho('', 'Calle del Muelle', '', 'Llanes', 43.4205, -4.7540)] },
  // Una dirección completa que sí está
  'avenida de la constitución 12, cangas de onís': { n: [nomi('', 'Avenida de la Constitución', '12', 'Cangas de Onís', 43.3505, -5.1295)], p: [pho('', 'Avenida de la Constitución', '12', 'Cangas de Onís', 43.3506, -5.1296)] },
};
const key = s => decodeURIComponent(s || '').toLowerCase().replace(/\+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'es-ES' });
    const p = await ctx.newPage(), errs = [], asked = [];
    p.on('pageerror', e => errs.push(e.message));
    let down = { photon: false, nominatim: false };
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.hostname === 'photon.komoot.io') {
        asked.push('P:' + key(u.searchParams.get('q')));
        if (down.photon) return r.fulfill({ status: 503, body: 'down' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: (DB[key(u.searchParams.get('q'))] || {}).p || [] }) });
      }
      if (u.hostname === 'nominatim.openstreetmap.org') {
        if (u.pathname.startsWith('/reverse')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        const q = u.searchParams.get('q') || (u.searchParams.get('street') + ', ' + u.searchParams.get('city'));
        asked.push('N:' + key(q));
        if (down.nominatim) return r.fulfill({ status: 503, body: 'down' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify((DB[key(q)] || {}).n || []) });
      }
      if (!u.href.startsWith(BASE)) return r.abort();
      const f = path.join(SITE, decodeURIComponent(u.pathname.slice(1)) || 'index.html');
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'no' });
      return r.fulfill({ status: 200, contentType: MIME[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    const W = ms => p.waitForTimeout(ms);
    await p.goto(BASE); await W(600);
    await p.click('#go'); await W(300); await p.fill('[name=nombre]', 'La Tortuga'); await p.fill('[name=km]', '145.000'); await p.click('.sheet [data-save]'); await W(800);
    await p.goto(BASE + '#/viajes'); await W(300); await p.click('#add'); await W(300); await p.fill('.sheet [name=nombre]', 'Asturias'); await p.click('.sheet [data-save]'); await W(1000);
    const buscar = async (txt, enter = true) => { asked.length = 0; await p.fill('#q', txt); if (enter) await p.press('#q', 'Enter'); await W(enter ? 600 : 1400); return (await p.innerText('#sg')).replace(/ /g, ' '); };

    // 1) Dirección con abreviaturas y piso cuyo número no está en el mapa → se limpia y encuentra la calle
    let r = await buscar('C/ Mayor nº 5, 3º izq, Llanes');
    if (process.env.SHOTS) { await p.evaluate(() => { const r = document.querySelector('#q').getBoundingClientRect(); scrollBy(0, r.top - 90); }); await W(300); await p.screenshot({ path: path.join(process.env.SHOTS, 'busq.png') }); }
    ok(asked.includes('N:calle mayor 5, llanes') && asked.includes('P:calle mayor 5, llanes'), 'se pregunta a los dos buscadores con la dirección limpia («calle mayor 5, llanes»): ' + asked.slice(0, 2).join(' | '));
    ok(r.includes('Calle Mayor') && r.includes('No encuentro ese número'), 'sin ese número en el mapa: enseña la calle y avisa de que es aproximado');
    ok((await p.locator('#sg [data-r]').count()) === 1, 'los dos buscadores dan el mismo sitio: sale una sola vez');
    await p.click('#sg [data-r]'); await W(400);
    const st = await p.evaluate(() => import('./js/db.js').then(m => m.D.trips[0].paradas));
    ok(st.length === 1 && st[0].label === 'Calle Mayor' && Math.abs(st[0].lat - 43.4196) < 1e-3, 'tocar el resultado añade la parada en ese sitio');

    // 2) Con una errata: Nominatim no la encuentra, Photon sí
    r = await buscar('area autocaravanas lanes');
    ok(r.includes('Área de autocaravanas de Llanes') && !r.includes('aproximado'), 'con una errata la encuentra igual (Photon tolera erratas)');

    // 3) Lo cercano primero: hay un «Llanes» en Asturias y otro lejos
    r = await buscar('Llanes');
    const items = await p.locator('#sg [data-r]').allInnerTexts();
    ok(items.length === 2 && !items[0].includes('Sobrescobio'), 'varios lugares con el mismo nombre: primero el cercano a tu viaje, sin repetidos (' + items.map(x => x.split('\n')[0] + (x.split('\n')[1] ? ' / ' + x.split('\n')[1] : '')).join(' · ') + ')');

    // 4) Dirección completa que está tal cual
    r = await buscar('Avda. de la Constitución 12 bajo, Cangas de Onís');
    ok(r.includes('Avenida de la Constitución 12') && !r.includes('No encuentro'), 'dirección con número que sí está: resultado exacto (Avda. → Avenida, sin «bajo»)');

    // 5) Escribir sin pulsar Intro también busca (al dejar de escribir)
    r = await buscar('Llanes', false);
    ok(r.includes('Llanes') && asked.length >= 2, 'al dejar de escribir busca solo, sin pulsar Intro');

    // 6) Coordenadas o enlace de Google Maps: directo, sin preguntar a nadie
    r = await buscar('https://www.google.com/maps/place/Llanes/@43.4199,-4.7552,15z');
    ok(r.includes('43.41990, -4.75520') && asked.length === 0, 'pegar un enlace de Google Maps pone el punto directamente');
    r = await buscar('43,42 -4,75');
    ok(r.includes('43.42000, -4.75000'), 'coordenadas con coma decimal también');

    // 7) No aparece nada en ningún sitio: lo dice y explica cómo buscar mejor
    r = await buscar('Calle Inventada 99, Pueblo Que No Existe');
    ok(r.includes('No encuentro') && r.includes('sin número'), 'nada en ningún buscador: lo dice y da una pista');
    ok(asked.some(a => a === 'N:calle inventada, pueblo que no existe') && asked.some(a => a === 'P:pueblo que no existe'), 'antes de rendirse prueba sin el número y solo con el pueblo');

    // 8) Un servicio caído: el otro basta. Los dos caídos: aviso claro
    down = { photon: true, nominatim: false };
    r = await buscar('Llanes');
    ok(r.includes('Llanes') && !r.includes('No se pudo'), 'con Photon caído busca igual con Nominatim');
    down = { photon: false, nominatim: true };
    r = await buscar('Llanes');
    ok(r.includes('Llanes') && !r.includes('No se pudo'), 'con Nominatim caído busca igual con Photon');
    down = { photon: true, nominatim: true };
    r = await buscar('Llanes');
    ok(r.includes('No se pudo buscar ahora'), 'con los dos caídos: «No se pudo buscar ahora. Toca el mapa…»');
    down = { photon: false, nominatim: false };

    r = await buscar('Calle del Muelle 3, Llanes');
    ok(r.includes('Calle del Muelle') && r.includes('No encuentro ese número'), 'un buscador da la calle sin el portal: también avisa de que no es el número exacto');
    ok(!errs.length, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } catch (e) { ok(false, 'la prueba se interrumpió: ' + e.message.split('\n').slice(0, 6).join(' · ')); console.error(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
