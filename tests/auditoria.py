# Siembra un año de uso realista por la propia API de datos y fotografía todas las pantallas
import sys
from playwright.sync_api import sync_playwright
import os; O=os.path.join(os.path.dirname(os.path.abspath(__file__)),'capturas','auditoria')+'/'; os.makedirs(O, exist_ok=True)
SEED='''async () => {
 const db = await import('/js/db.js'); const st = await import('/js/store.js');
 await db.setKV('vehicle', {nombre:'La Tortuga', marca:'Fiat Ducato (serie 230)', base:'1.9 TD diésel', carroceria:'Capuchina', anio:1999, matricula:'M-1234-XZ', fechaMat:'1999-04-15', fechaCompra:'2024-05-10', kmCompra:128000, catITV:'M1', km:145000, deposito:80, altura:3.05, longitud:6.4, anchura:2.3, mma:3500});
 await db.setKV('setup', true); await db.setKV('setupAt', Date.now() - 400*864e5); await db.setKV('lastBackup', Date.now() - 50*864e5);
 await st.seedPlan();
 const T = db.D.tasks; const set = async (n, f, k) => { const t = T.find(x => x.nombre.startsWith(n)); if (t) await db.put('tasks', {...t, ultFecha: f, ultKm: k, manFecha: f, manKm: k}); };
 await set('Aceite', '2025-11-02', 139500); await set('Filtro de aire', '2024-06-01', 129000); await set('Filtro de gasóleo', '2025-11-02', 139500);
 await set('Correa de distribución', '2024-06-01', 129000); await set('Líquido de frenos', '2024-06-01', ''); await set('Presión', '2026-10-01', '');
 await set('Extintor', '2025-12-01', ''); await set('Sellado', '2026-03-01', ''); await set('Latiguillos de gas', '2022-01-01', '');
 const fuel = [['2025-11-20',139800,60,1.459,true,'Repsol Lleida'],['2025-12-28',140400,52,1.482,true,'Cepsa Zaragoza'],['2026-02-14',141000,55.5,1.512,true,'Ballenoil Teruel'],['2026-04-02',141550,20,1.549,false,'Plenoil'],['2026-04-03',141700,35,1.539,true,'Repsol Cuenca'],['2026-06-20',142500,58,1.579,true,'BP Burgos'],['2026-07-15',143200,61,1.601,true,'Galp Santander'],['2026-08-10',143900,57,1.555,true,'Shell Oviedo'],['2026-09-18',144600,56,1.523,true,'Cepsa León'],['2026-10-12',145000,40,1.498,true,'Ballenoil Lleida']];
 for (const [f,k,l,p,ll,c] of fuel) await db.put('expenses', {fecha:f, cat:'Combustible', km:k, litros:l, importe:Math.round(l*p*100)/100, lleno:ll, concepto:c});
 const tr = await db.put('trips', {nombre:'Picos de Europa', inicio:'2026-07-12', fin:'2026-07-26', kmIni:142600, kmFin:143800, kmRuta:1105, durMin:1260, fuente:'carretera', legs:[420,180,505], paradas:[{id:'a',lat:41.61,lon:0.62,label:'Lleida',tipo:'visita'},{id:'b',lat:43.36,lon:-4.82,label:'Cangas de Onís',tipo:'area'},{id:'c',lat:43.18,lon:-4.83,label:'Posada de Valdeón',tipo:'camping'},{id:'d',lat:41.61,lon:0.62,label:'Lleida',tipo:'visita'}]});
 await db.put('trips', {nombre:'Pirineo aragonés', inicio:'2026-11-08', fin:'2026-11-11', kmRuta:410, durMin:420, fuente:'carretera', paradas:[{id:'e',lat:41.61,lon:0.62,label:'Lleida',tipo:'visita'},{id:'f',lat:42.63,lon:-0.11,label:'Torla-Ordesa',tipo:'area'}]});
 const ex = [['2026-07-13','Área / camping',12,'Área de Cangas',tr.id],['2026-07-16','Área / camping',28,'Camping Valdeón',tr.id],['2026-07-20','Peajes',14.6,'AP-66',tr.id],['2026-01-15','Seguro',412,'Mapfre',''],['2026-03-10','Impuestos y tasas',68.4,'IVTM',''],['2026-05-20','Equipamiento',89.9,'Toldo — reparación','']];
 for (const [f,c,i,n,v] of ex) await db.put('expenses', {fecha:f, cat:c, importe:i, concepto:n, viajeId:v});
 for (const e of db.D.expenses) if (e.cat==='Combustible' && e.fecha>='2026-07-12' && e.fecha<='2026-07-26') await db.put('expenses', {...e, viajeId: tr.id});
 const ac = db.D.tasks.find(x => x.nombre.startsWith('Aceite'));
 const g = await db.put('expenses', {fecha:'2025-11-02', cat:'Mantenimiento', importe:145, concepto:'Aceite y filtro · Taller Pérez', km:139500});
 await db.put('services', {fecha:'2025-11-02', km:139500, coste:145, taller:'Taller Pérez', nombre: ac.nombre, zona: ac.zona, tareaId: ac.id, gastoId: g.id, notas:'10W40 semisintético, 6 L'});
 await db.put('docs', {tipo:'ITV', nombre:'ITV Lleida', vence:'2026-11-05', avisoDias:30, importe:58});
 await db.put('docs', {tipo:'Seguro', nombre:'Mapfre', vence:'2027-01-15', avisoDias:30, importe:412, ref:'AC-993311', tel:'900 822 822'});
 await db.put('places', {label:'Cangas de Onís', lat:43.36, lon:-4.82, tipo:'area'});
 await db.put('odo', {fecha:'2026-10-20', km:145120});
}'''
pages=[('inicio','#/inicio'),('mant','#/mant'),('mant-hist',None),('viajes','#/viajes'),('viaje',None),('gastos','#/gastos/gastos'),('comb','#/gastos/combustible'),('docs','#/gastos/docs'),('stats','#/stats'),('stats-todo',None)]+[('aj-'+s,'#/ajustes/'+s) for s in ['vehiculo','apariencia','avisos','viajes','copia','avanzado']]
with sync_playwright() as p:
  b=p.chromium.launch()
  for mode in ['light','dark']:
    for vp,(w,h) in [('m',(390,844)),('d',(1280,860))]:
      ctx=b.new_context(viewport={'width':w,'height':h},device_scale_factor=2 if vp=='m' else 1,color_scheme=mode)
      pg=ctx.new_page(); errs=[]
      pg.on('pageerror',lambda e: errs.append(str(e)))
      pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text else None)
      pg.goto('http://localhost:8765/'); pg.wait_for_timeout(500); pg.evaluate(SEED); pg.goto('http://localhost:8765/#/inicio'); pg.reload(); pg.wait_for_timeout(700)
      for name,url in pages:
        if name=='mant-hist': pg.goto('http://localhost:8765/#/mant'); pg.wait_for_timeout(300); pg.click('#seg [data-v=hist]')
        elif name=='stats-todo': pg.goto('http://localhost:8765/#/stats'); pg.wait_for_timeout(300); pg.click('#per [data-v=todo]')
        elif name=='viaje': pg.goto('http://localhost:8765/#/viajes'); pg.wait_for_timeout(300); pg.click('a.row >> nth=1')
        else: pg.goto('http://localhost:8765/'+url)
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'{O}{mode}-{vp}-{name}.png',full_page=True)
      if mode=='light' and vp=='m':
        pg.goto('http://localhost:8765/#/mant'); pg.wait_for_timeout(300); pg.click('#seg [data-v=plan]'); pg.wait_for_timeout(300); pg.click('[data-t] >> nth=0'); pg.wait_for_timeout(400); pg.screenshot(path=O+'light-m-sheet-tarea.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.goto('http://localhost:8765/#/inicio'); pg.wait_for_timeout(300); pg.click('#qm'); pg.wait_for_timeout(400); pg.screenshot(path=O+'light-m-sheet-mant.png',full_page=False)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300); pg.click('#fab'); pg.wait_for_timeout(400); pg.screenshot(path=O+'light-m-sheet-fab.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.goto('http://localhost:8765/#/stats'); pg.wait_for_timeout(400); pg.hover('.sbars .c >> nth=6'); pg.wait_for_timeout(200); pg.screenshot(path=O+'light-m-stats-hover.png')
      print(mode,vp,'errores:',errs)
      ctx.close()
  b.close()
