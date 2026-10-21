# Mide usabilidad de forma objetiva en todas las pantallas (móvil)
import re, json, time
from playwright.sync_api import sync_playwright
S=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'auditoria.py')).read()
SEED=re.search(r"SEED='''(.*?)'''",S,re.S).group(1)
BIG='''async () => {
 const db = await import('/js/db.js');
 // 3 años de uso intenso: ~1500 gastos, 60 viajes, 300 mantenimientos
 let km = 120000; const cats = ['Combustible','Peajes','Área / camping','Equipamiento','Otros'];
 for (let d = 0; d < 1095; d++) {
   const f = new Date(2023, 10, 1 + d), iso = f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0');
   if (iso > '2026-10-20') break;
   if (d % 3 === 0) { km += 120; await db.put('expenses', {fecha: iso, cat: 'Combustible', km, litros: 10, importe: 15.2, lleno: d % 6 === 0, concepto: 'Gasolinera ' + (d % 17)}); }
   if (d % 2 === 0) await db.put('expenses', {fecha: iso, cat: cats[1 + d % 4], importe: 5 + d % 30, concepto: 'Concepto ' + (d % 23)});
   if (d % 18 === 0) await db.put('trips', {nombre: 'Viaje ' + d, inicio: iso, fin: iso, kmRuta: 300, paradas: []});
 }
}'''
CHECK='''() => {
  const W = innerWidth, out = { small: [], unnamed: [], overflow: [], unlabeled: [] };
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=tab], summary, label.lr').forEach(e => {
    if (!vis(e) || e.closest('.leaflet-container') || e.closest('.tw')) return;
    const r = e.getBoundingClientRect();
    const tag = (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ' ' + (e.innerText || e.getAttribute('aria-label') || e.name || '').trim().slice(0, 30);
    if ((r.height < 40 || r.width < 40) && !e.matches('input[type=checkbox]')) out.small.push(e.tagName + tag + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    const name = (e.getAttribute('aria-label') || e.innerText || e.title || e.value || e.placeholder || '').trim();
    if (!name && !e.matches('input,select')) out.unnamed.push(e.tagName + tag);
    if (e.matches('input,select,textarea') && !e.closest('label') && !e.getAttribute('aria-label') && !(e.id && document.querySelector(`label[for="${e.id}"]`))) out.unlabeled.push(e.tagName + tag);
  });
  document.querySelectorAll('#view *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > W + 1 && vis(e) && !e.closest('.tw') && !e.closest('.seg')) out.overflow.push(e.tagName + '.' + e.className); });
  const dedupe = a => [...new Set(a)];
  return { small: dedupe(out.small).slice(0, 40), unnamed: dedupe(out.unnamed), unlabeled: dedupe(out.unlabeled), overflow: dedupe(out.overflow).slice(0, 10), sw: document.documentElement.scrollWidth };
}'''
pages=['#/inicio','#/mant','#/viajes','#/gastos/gastos','#/gastos/combustible','#/gastos/docs','#/stats']+['#/ajustes/'+x for x in ['vehiculo','apariencia','avisos','viajes','copia','avanzado']]
with sync_playwright() as p:
  b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
  pg.on('pageerror',lambda e: errs.append(str(e)))
  pg.goto('http://localhost:8765/'); pg.wait_for_timeout(400); pg.evaluate(SEED); pg.reload(); pg.wait_for_timeout(500)
  res={}
  for u in pages:
    pg.goto('http://localhost:8765/'+u); pg.wait_for_timeout(450); res[u]=pg.evaluate(CHECK)
  # hojas
  for name,act in [('gasto',"document.querySelector('#fab').click(); await new Promise(r=>setTimeout(r,300)); document.querySelector('.qa button').click();"),('viaje-editor',None)]:
    pass
  pg.goto('http://localhost:8765/#/inicio'); pg.wait_for_timeout(300); pg.click('#fab'); pg.wait_for_timeout(300); pg.click('.qa button >> nth=0'); pg.wait_for_timeout(500)
  res['hoja repostaje']=pg.evaluate(CHECK)
  print(json.dumps(res,ensure_ascii=False,indent=1))
  # Atrás: abre hoja, atrás → hoja cerrada y sigue en la misma pantalla
  pg.go_back(); pg.wait_for_timeout(400); print('ATRAS cierra hoja:', pg.locator('.sheet').count()==0, pg.url)
  # Rendimiento con 3 años de datos
  pg.evaluate(BIG); pg.reload(); pg.wait_for_timeout(800)
  print('registros:', pg.evaluate("import('/js/db.js').then(m=>m.D.expenses.length+' gastos, '+m.D.trips.length+' viajes')"))
  for u in ['#/inicio','#/gastos/gastos','#/gastos/combustible','#/stats','#/viajes','#/mant']:
    t0=time.time(); pg.goto('http://localhost:8765/'+u); pg.wait_for_selector('#view .vh', timeout=20000)
    ms=pg.evaluate("new Promise(r=>requestAnimationFrame(()=>r(performance.now())))")
    t=pg.evaluate('''async (u) => { const r = await import('/js/router.js'); const t0 = performance.now(); await r.refresh(); return Math.round(performance.now() - t0); }''', u)
    print('render', u, t, 'ms', 'DOM nodos:', pg.evaluate("document.querySelectorAll('#view *').length"))
  print('errores:', errs)
  b.close()
