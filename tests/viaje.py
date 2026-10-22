# Prueba "de viaje" del service worker: sin conexión, con cobertura malísima y con una versión nueva
# publicada mientras hay un formulario a medias. Sirve una copia de site/ en un servidor local que,
# cuando se le pide, tarda 20 s en cada respuesta (como una raya de cobertura en la montaña).
# Uso: python3 tests/viaje.py   (necesita el paquete playwright de Python)
import time, os, re, sys, shutil, tempfile, threading, http.server, socketserver
from playwright.sync_api import sync_playwright

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
SITE = tempfile.mkdtemp(prefix='cz-viaje-') + '/site'
shutil.copytree(SRC, SITE)
VER = re.search(r"export const VER = '([^']+)'", open(SITE + '/js/store.js').read()).group(1)
NEW = VER + '.9'
open(SITE + '/version.txt', 'w').write(VER)
LENTO = {'on': False}

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=SITE, **k)
    def do_GET(s):
        if LENTO['on']: time.sleep(20)
        return super().do_GET()
    def end_headers(s):
        if s.path.startswith('/sw.js') or s.path.startswith('/version.txt'): s.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(s, *a): pass
class T(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True
srv = T(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
B = f'http://127.0.0.1:{srv.server_address[1]}/'
res = []
def ok(c, m): res.append((c, m)); print(('  ✓ ' if c else '  ✗ ') + m, flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('PW_EXE') or None)
    c = b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, locale='es-ES')
    pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B); pg.wait_for_timeout(800)
    pg.click('#go'); pg.wait_for_timeout(300); pg.fill('[name=nombre]', 'Prueba'); pg.fill('[name=km]', '145.000'); pg.click('.sheet [data-save]'); pg.wait_for_timeout(800)
    pg.evaluate("navigator.serviceWorker.ready"); pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_timeout(800)
    ok(pg.evaluate("!!navigator.serviceWorker.controller"), 'service worker activo y controlando la app')
    # 1) Sin conexión
    c.set_offline(True); t = time.time(); pg.reload(); pg.wait_for_selector('#view .vh', timeout=10000); dt = time.time() - t
    ok(dt < 3, f'sin conexión, la app abre ({dt:.1f} s)')
    bad = []
    for u in ['#/mant', '#/viajes', '#/gastos/gastos', '#/gastos/combustible', '#/gastos/docs', '#/stats', '#/ajustes/vehiculo', '#/ajustes/apariencia', '#/ajustes/copia']:
        pg.goto(B + u); pg.wait_for_timeout(300)
        if not pg.locator('#view .vh').count(): bad.append(u)
    ok(not bad, 'sin conexión: todas las pantallas se abren' + (' (fallan: ' + ', '.join(bad) + ')' if bad else ''))
    pg.goto(B + '#/inicio'); pg.wait_for_timeout(300); pg.click('#qf'); pg.wait_for_timeout(300)
    pg.fill('.sheet [name=litros]', '40'); pg.fill('.sheet [name=ppl]', '1,5'); pg.fill('.sheet [name=km]', '145.300'); pg.click('.sheet [data-save]'); pg.wait_for_timeout(500)
    ok(pg.locator('.sheet').count() == 0, 'sin conexión: se guarda un repostaje')
    pg.goto(B + '#/viajes'); pg.wait_for_timeout(300); pg.click('#add'); pg.wait_for_timeout(300); pg.fill('.sheet [name=nombre]', 'Sin red'); pg.click('.sheet [data-save]'); pg.wait_for_timeout(1500)
    ok('No se ha podido cargar el mapa' in pg.inner_text('#mh'), 'sin conexión: el editor de viaje avisa de que no hay mapa y sigue funcionando')
    pg.fill('#q', 'Cangas'); pg.wait_for_timeout(1200)
    ok('Sin conexión' in pg.inner_text('#sg'), 'sin conexión: el buscador de lugares lo dice')
    c.set_offline(False)
    # 2) Cobertura mala: el servidor tarda 20 s en cada respuesta (también para el service worker)
    LENTO['on'] = True; t = time.time()
    try: pg.reload(wait_until='commit', timeout=60000); pg.wait_for_selector('#view .vh', timeout=60000); dt = time.time() - t
    except Exception: dt = 99
    ok(dt < 4, f'cobertura mala (20 s por petición): la app abre en {dt:.1f} s')
    LENTO['on'] = False; pg.wait_for_timeout(500)
    # 3) Versión nueva publicada con un formulario a medias
    pg.goto(B + '#/inicio'); pg.wait_for_timeout(600)
    pg.click('#qf'); pg.wait_for_timeout(300); pg.fill('.sheet [name=litros]', '12')
    for f, a, z in [('sw.js', f"const V = 'cz-{VER}';", f"const V = 'cz-{NEW}';"), ('js/store.js', f"export const VER = '{VER}';", f"export const VER = '{NEW}';")]:
        s = open(SITE + '/' + f).read(); assert a in s, f; open(SITE + '/' + f, 'w').write(s.replace(a, z))
    open(SITE + '/version.txt', 'w').write(NEW)
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())"); pg.wait_for_timeout(4000)
    ok(pg.locator('.sheet').count() == 1 and pg.input_value('.sheet [name=litros]') == '12', 'versión nueva descargada: NO recarga con el repostaje a medias')
    ok(not pg.locator('#vnb').is_hidden(), 'aparece el aviso de versión nueva')
    ok(NEW in pg.inner_text('#vnv') and VER in pg.inner_text('#vnv'), 'el aviso dice qué versión llega y cuál tienes')
    covered = pg.evaluate("(()=>{const r=document.querySelector('#vng').getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !e||!e.closest('#vnb')})()")
    ok(covered, 'con el repostaje abierto, «Actualizar ahora» queda detrás del formulario (no se pulsa por error)')
    ok(pg.locator('.sheet').count() == 1 and pg.input_value('.sheet [name=litros]') == '12', 'con el repostaje abierto, el aviso queda detrás y no recarga')
    pg.fill('.sheet [name=ppl]', '1,5'); pg.fill('.sheet [name=km]', '145.400'); pg.click('.sheet [data-save]'); pg.wait_for_timeout(500)
    ok(pg.locator('.sheet').count() == 0, 'el repostaje a medias se termina y se guarda')
    pg.click('#vnx'); pg.wait_for_timeout(200)
    ok(pg.locator('#vnb').is_hidden(), '«Ahora no» oculta el aviso')
    pg.evaluate("window.__czChk()"); pg.wait_for_timeout(800)
    ok(pg.locator('#vnb').is_hidden(), 'y no vuelve a salir para esa versión mientras la app sigue abierta')
    pg.evaluate("document.querySelector('#vnb').hidden=false")
    pg.click('#vng'); pg.wait_for_timeout(1500)
    ok('actualizada' in pg.inner_text('#toast'), 'tras actualizar, un aviso lo confirma')
    ver = pg.evaluate("import('/js/store.js').then(m=>m.VER)")
    ok(ver == NEW, f'al pulsar «Actualizar ahora» carga la versión nueva ({ver})')
    n = pg.evaluate("import('/js/db.js').then(m=>m.D.expenses.length)")
    ok(n == 2, f'los datos siguen ahí tras actualizar ({n} repostajes)')
    ok(not errs, 'sin errores de JavaScript' + (': ' + ' | '.join(errs) if errs else ''))
    b.close()
srv.shutdown(); shutil.rmtree(os.path.dirname(SITE), ignore_errors=True)
f = [m for c, m in res if not c]
print(f'\n{len(f)} fallo(s):\n- ' + '\n- '.join(f) if f else '\nTodo correcto'); sys.exit(1 if f else 0)
