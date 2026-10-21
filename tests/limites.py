import re, json
from playwright.sync_api import sync_playwright
S=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'auditoria.py')).read()
SEED=re.search(r"SEED='''(.*?)'''",S,re.S).group(1)
LONG='''async () => {
 const db = await import('/js/db.js'); const L = 'Supercalifragilísticoespialidoso'.repeat(2);
 const v = db.D.kv.vehicle; await db.setKV('vehicle', {...v, nombre: 'La Tortuga Viajera del Norte Peninsular', marca: 'Fiat Ducato (serie 230) Benimar Tessoro 482 Edición Especial'});
 await db.put('trips', {nombre: 'Gran vuelta por los Pirineos franceses y catalanes', inicio:'2026-05-01', fin:'2026-05-30', kmRuta: 23456.7, paradas: [{id:'z',lat:42.5,lon:1.5,label:'Santa Coloma de Queralt y alrededores del Penedès',tipo:'camping'}]});
 await db.put('expenses', {fecha:'2026-10-01', cat:'Equipamiento', importe: 12345.67, concepto: L.slice(0,80)});
 await db.put('docs', {tipo:'Asistencia en carretera', nombre:'Mutua Madrileña Automovilista Asistencia', vence:'2027-02-01', tel:'+34 900 100 200', ref:'POL-0099887766'});
 const t = db.D.tasks[0]; await db.put('tasks', {...t, nombre: 'Revisión completa de la instalación eléctrica de 12 V'});
}'''
CHECK='''() => { const W = innerWidth, out = []; document.querySelectorAll('#view *, .sheet *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1 && !e.closest('.tw') && !e.closest('.seg')) out.push(e.tagName + '.' + (e.className||'') + ' «' + (e.innerText||'').slice(0,30) + '»'); }); return [document.documentElement.scrollWidth, [...new Set(out)].slice(0,8)]; }'''
with sync_playwright() as p:
  b=p.chromium.launch(); pg=b.new_page(viewport={'width':360,'height':740},device_scale_factor=2)
  pg.goto('http://localhost:8765/'); pg.wait_for_timeout(400); pg.evaluate(SEED); pg.evaluate(LONG); pg.reload(); pg.wait_for_timeout(500)
  O=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'capturas','limites')+'/'; __import__('os').makedirs(O, exist_ok=True)
  for u in ['#/inicio','#/mant','#/viajes','#/gastos/gastos','#/gastos/docs','#/stats','#/ajustes/vehiculo']:
    pg.goto('http://localhost:8765/'+u); pg.wait_for_timeout(450); print(u, pg.evaluate(CHECK))
    pg.screenshot(path=O+'lim'+u.replace('#/','-').replace('/','_')+'.png', full_page=True)
  pg.goto('http://localhost:8765/#/viajes'); pg.wait_for_timeout(300); pg.click('a.row:has-text("Gran vuelta")'); pg.wait_for_timeout(1200); print('viaje', pg.evaluate(CHECK)); pg.screenshot(path=O+'lim-viaje.png', full_page=True)
  # Hoja con cambios: X pregunta; aceptar descarta
  pg.goto('http://localhost:8765/#/inicio'); pg.wait_for_timeout(300); pg.click('#fab'); pg.wait_for_timeout(300); pg.click('.qa button >> nth=1'); pg.wait_for_timeout(400)
  pg.fill('.sheet [name=importe]','12'); msgs=[]
  pg.once('dialog', lambda d: (msgs.append(d.message), d.dismiss())); pg.click('.sheet [data-x]'); pg.wait_for_timeout(300)
  print('X con cambios pregunta y cancelar mantiene:', msgs, pg.locator('.sheet').count()==1)
  pg.once('dialog', lambda d: (msgs.append(d.message), d.dismiss())); pg.go_back(); pg.wait_for_timeout(400)
  print('Atrás con cambios, cancelar mantiene:', pg.locator('.sheet').count()==1)
  pg.once('dialog', lambda d: d.accept()); pg.go_back(); pg.wait_for_timeout(400)
  print('Atrás con cambios, aceptar descarta:', pg.locator('.sheet').count()==0, pg.url)
  b.close()
