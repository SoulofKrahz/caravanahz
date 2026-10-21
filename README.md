# Caravanahz

Webapp personal creada por Krahz para una autocaravana capuchina Fiat Ducato 1999 1.9 TD: mantenimiento,
viajes, gastos, combustible, documentos y estadísticas. Sin servidor: los datos viven en el navegador (IndexedDB).

La web está en `site/` y se publica sola en Cloudflare Pages al subir cambios a la rama `main`
(ver `.github/workflows/deploy.yml`): primero se prueba en un navegador real y solo se publica si todo pasa.

- Versión visible en la app: Ajustes → Avanzado. Si hay una más nueva publicada, la app avisa.
- En cada cambio: subir `VER` en `site/js/store.js` y `V` en `site/sw.js`.
- Formato de `VER`: `AAAA-MM-DD-N` para cada cambio (N = 0, 1, 2… dentro del día) y `AAAA-MM-DD-N.M`
  para cambios menores sobre esa versión (p. ej. `2026-10-21-0`, luego `2026-10-21-0.1`). En `sw.js`: `cz-` + la misma versión.

## Pruebas
- `node tests/logica.test.mjs` — fechas, km, consumo, costes y estadísticas (sin navegador).
- `node tests/smoke.cjs` — la prueba que ejecuta GitHub antes de publicar (móvil y PC, Playwright).
- Pruebas largas en Python (Playwright), con `python3 -m http.server 8765` en marcha **dentro de `site/`**:
  `tests/navegador.py` (flujos y validaciones), `tests/auditoria.py` (capturas de todas las pantallas),
  `tests/usabilidad.py` (zonas táctiles, accesibilidad, rendimiento), `tests/limites.py` (textos al límite).

## Estructura de `site/`
- `js/logic.js` — cálculos puros (vencimientos, km interpolados, consumo, costes de viaje, estadísticas, .ics).
- `js/db.js` — IndexedDB, copia y restauración. `js/valid.js` — validación de formularios.
- `js/perfil.js` — todo lo específico del Ducato 1.9 TD (plan de mantenimiento con el origen de cada intervalo, ITV).
- `js/store.js` — versión, categorías, estados. `js/forms.js` — formularios compartidos y alta rápida (botón +).
- `js/theme.js` — tema y color. `js/install.js` — instalación como app.
- `js/mods/*` — una pantalla por archivo: inicio, mant, viajes, gastos, combustible, stats, ajustes.
- `sw.js` — funciona sin conexión salvo mapa, rutas y búsqueda.

## Servicios externos (gratuitos, sin clave)
Mapa: teselas de Esri. Rutas: servidor público de OSRM (perfil coche, sin garantías). Búsqueda: Nominatim.

## Pendiente
Vista 3D con zonas tocables, checklists de salida/llegada/invernaje, importar desde Rutahz, rutas con perfil camión.
