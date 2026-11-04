// Búsqueda de direcciones y lugares para los viajes.
//
// Por qué así: Nominatim (OpenStreetMap) solo encuentra lo que se escribe tal cual está en el mapa. Falla con
// «C/ Mayor 5», con erratas, con palabras a medio escribir y con números de portal que no están en el mapa
// (en España faltan muchos: entonces no devuelve nada, ni siquiera la calle). Por eso:
//  1. Se limpia lo escrito: abreviaturas (C/, Avda., Ctra., Pza., nº…), pisos y puertas, códigos postales sueltos.
//  2. Se pregunta a la vez a Photon (tolera erratas y palabras a medias) y a Nominatim, y se juntan los resultados,
//     primero los más cercanos a donde estás mirando el mapa.
//  3. Si nadie encuentra nada: sin el número de portal (la calle), por partes (calle + pueblo) y, por último, el pueblo.
//     Esos resultados salen marcados como aproximados para que se vea que no es el portal exacto.
//  4. Coordenadas («43.42, -4.75») o un enlace de Google Maps pegados van directos, sin buscar.
// Todo con tiempo máximo: con cobertura mala nada se queda esperando para siempre.

const NOMI = 'https://nominatim.openstreetmap.org', PHOTON = 'https://photon.komoot.io';

/** Señal que se cancela sola a los `ms` o cuando se cancela `parent` */
export function timeout(ms, parent) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  if (parent) { if (parent.aborted) c.abort(); else parent.addEventListener('abort', () => { clearTimeout(t); c.abort(); }); }
  return c.signal;
}

/* ---------- Limpieza de lo escrito ---------- */
const ABR = [
  [/(^|[\s,])c\s*\/\s*/gi, '$1calle '], [/(^|[\s,])(cl|cll|c)\.\s+/gi, '$1calle '],
  [/(^|[\s,])(avda|avd|av)\.?(?=\s)/gi, '$1avenida'], [/(^|[\s,])(ctra|crta|cra)\.?(?=\s)/gi, '$1carretera'],
  [/(^|[\s,])(pza|plz|pl)\.?(?=\s)/gi, '$1plaza'], [/(^|[\s,])(p[ºo°]|pso)\.?(?=\s)/gi, '$1paseo'],
  [/(^|[\s,])(urb)\.?(?=\s)/gi, '$1urbanización'], [/(^|[\s,])(pol|polig)\.?(?=\s)/gi, '$1polígono'],
  [/(^|[\s,])(trav|trva)\.?(?=\s)/gi, '$1travesía'], [/(^|[\s,])(cmno|cno)\.?(?=\s)/gi, '$1camino'],
  [/(^|[\s,])(rda)\.?(?=\s)/gi, '$1ronda'], [/(^|[\s,])(bº|bo)\.?(?=\s)/gi, '$1barrio'],
];
/** Quita lo que confunde al buscador y desarrolla las abreviaturas de calles españolas */
export function cleanQuery(q) {
  let s = ' ' + String(q || '').replace(/\s+/g, ' ').trim() + ' ';
  for (const [re, to] of ABR) s = s.replace(re, to);
  s = s
    .replace(/\b(n[ºo°.]|núm\.?|num\.?|número)\s*(?=\d)/gi, '')     // «nº 5» → «5»
    .replace(/,?\s*\b\d{1,2}\s*[ºª°]\s*(izq(da)?|dcha?|der|[a-h])?\b\.?/gi, '') // el piso: «3º izq», «2ª B»
    .replace(/,?\s*\b(piso|planta|puerta|pta|bajos?|entresuelo|esc(alera)?|izq(da|uierda)?|dcha|dch|derecha)\b\.?(\s+(\d{1,2}|[a-h])\b)?/gi, '') // pisos y puertas
    .replace(/\bs\/n\b/gi, '')                                      // «s/n»
    .replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
  return s;
}
/** La misma dirección sin el número de portal (para encontrar al menos la calle) */
export function withoutNumber(q) {
  return q.replace(/(?<!\bkm\.?\s?)(^|[\s,])\d{1,4}\s*[a-z]?\b(?!\s*(km|de\s))/gi, '$1').replace(/\b\d{5}\b/g, '').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
}

/** Coordenadas escritas o pegadas: «43.42, -4.75», «43,42 -4,75», «N 43.42 W 4.75» o enlaces de Google Maps */
export function parseCoords(q) {
  const s = String(q || '').trim();
  let m = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || s.match(/[?&](?:q|ll|query|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) m = s.match(/^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/);
  if (!m) m = s.match(/^(-?\d{1,2},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)$/);
  if (!m) { const h = s.match(/^([NS])\s*(\d{1,2}[.,]\d+)\s*,?\s*([EWO])\s*(\d{1,3}[.,]\d+)$/i); if (h) m = [0, (/s/i.test(h[1]) ? '-' : '') + h[2], (/[wo]/i.test(h[3]) ? '-' : '') + h[4]]; }
  if (!m) return null;
  const lat = +String(m[1]).replace(',', '.'), lon = +String(m[2]).replace(',', '.');
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/* ---------- Resultados ---------- */
const dist = (a, b) => { const R = 6371, t = x => x * Math.PI / 180, dLat = t(b.lat - a.lat), dLon = t(b.lon - a.lon); const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const uniq = a => [...new Set(a.filter(Boolean))];

/** Resultado de Photon (GeoJSON) → { lat, lon, label, full } */
export function fromPhoton(f) {
  const p = f.properties || {}, [lon, lat] = f.geometry.coordinates;
  const street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
  const label = p.name && p.name !== p.street ? (p.housenumber && !p.street ? p.name + ' ' + p.housenumber : p.name) : street || p.city || p.county || p.state || '';
  const place = p.city || p.town || p.village || p.district || p.locality || p.county;
  const full = uniq([label !== street ? street : '', place !== label ? place : '', p.state && p.state !== place ? p.state : '', p.country && p.countrycode !== 'ES' ? p.country : '']).join(', ');
  return { lat, lon, label: label || full, full: full || label, exact: !!p.housenumber, src: 'photon' };
}
/** Resultado de Nominatim → { lat, lon, label, full } */
export function fromNominatim(x) {
  const a = x.address || {}, parts = String(x.display_name || '').split(',').map(s => s.trim());
  const street = a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : '';
  const place = a.village || a.town || a.city || a.hamlet || a.municipality || a.county;
  const label = (x.name && x.name !== a.road ? x.name : street) || parts[0] || '';
  const full = uniq([label !== street ? street : '', place !== label ? place : '', a.state && a.state !== place ? a.state : '', a.country && a.country_code !== 'es' ? a.country : '']).join(', ') || parts.slice(1, 4).join(', ');
  return { lat: +x.lat, lon: +x.lon, label, full, exact: !!a.house_number, src: 'nominatim' };
}
/** Junta resultados quitando repetidos (mismo sitio a menos de 150 m) y ordena: cercanos al mapa primero */
export function merge(lists, near) {
  const out = [];
  for (const r of lists.flat()) if (r && Number.isFinite(r.lat) && Number.isFinite(r.lon) && !out.some(o => dist(o, r) < 0.15 && (o.label === r.label || dist(o, r) < 0.03))) out.push(r);
  if (near) {
    // Mantiene el orden de relevancia, pero lo que está a más de 300 km pasa detrás de lo cercano
    const far = r => dist(near, r) > 300;
    return [...out.filter(r => !far(r)), ...out.filter(far)].slice(0, 8);
  }
  return out.slice(0, 8);
}

/* ---------- Peticiones ---------- */
async function getJSON(url, signal, ms) {
  const r = await fetch(url, { signal: timeout(ms, signal), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function photon(q, near, signal) {
  const bias = near ? `&lat=${near.lat.toFixed(4)}&lon=${near.lon.toFixed(4)}&location_bias_scale=0.3` : '';
  const j = await getJSON(`${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=8${bias}`, signal, 9000);
  return (j.features || []).map(fromPhoton);
}
async function nominatim(params, signal) {
  const j = await getJSON(`${NOMI}/search?format=jsonv2&addressdetails=1&limit=6&accept-language=es&${params}`, signal, 10000);
  return (j || []).map(fromNominatim);
}
const settle = p => p.then(v => v, () => null);

/**
 * Busca una dirección o un lugar. Devuelve { results, approx, how } o lanza un error si no hay manera de buscar
 * (sin red, o los dos servicios caídos). `near` = { lat, lon } del centro del mapa para preferir lo cercano.
 */
export async function search(raw, { near, signal } = {}) {
  const c = parseCoords(raw);
  if (c) return { results: [{ ...c, label: `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`, full: 'Coordenadas', exact: true }], approx: false, how: 'coords' };
  const q = cleanQuery(raw);
  if (q.length < 3) return { results: [], approx: false, how: 'short' };
  // 1) Los dos buscadores a la vez
  const [ph, no] = await Promise.all([settle(photon(q, near, signal)), settle(nominatim('q=' + encodeURIComponent(q), signal))]);
  if (signal && signal.aborted) throw new DOMException('cancelada', 'AbortError');
  if (ph === null && no === null) throw new Error('Sin servicio de búsqueda');
  let res = merge([no || [], ph || []], near);
  // Con número de portal escrito pero ningún resultado lo tiene: es la calle, no el portal (se avisa)
  if (res.length) return { results: res, approx: withoutNumber(q) !== q && !res.some(r => r.exact), how: 'street' };
  // 2) Sin el número de portal: al menos la calle
  const qs = withoutNumber(q), parts = q.split(',').map(s => s.trim()).filter(Boolean);
  if (qs && qs !== q) {
    const [a, b] = await Promise.all([settle(photon(qs, near, signal)), settle(nominatim('q=' + encodeURIComponent(qs), signal))]);
    res = merge([b || [], a || []], near);
    if (res.length) return { results: res, approx: true, how: 'street' };
  }
  // 3) Por partes: calle + pueblo (búsqueda estructurada de Nominatim)
  if (parts.length >= 2) {
    const st = withoutNumber(parts[0]), city = parts[parts.length - 1].replace(/\b\d{5}\b/, '').trim();
    if (st && city) {
      res = merge([(await settle(nominatim(`street=${encodeURIComponent(st)}&city=${encodeURIComponent(city)}`, signal))) || []], near);
      if (res.length) return { results: res, approx: true, how: 'structured' };
    }
    // 4) El pueblo (lo último que se escribe suele ser el pueblo)
    if (city) {
      const [a, b] = await Promise.all([settle(photon(city, near, signal)), settle(nominatim('q=' + encodeURIComponent(city), signal))]);
      res = merge([b || [], a || []], near);
      if (res.length) return { results: res, approx: true, how: 'town' };
    }
  }
  return { results: [], approx: false, how: 'none' };
}

/** Nombre del sitio en unas coordenadas (para la parada marcada en el mapa) */
export async function reverse(lat, lon) {
  try {
    const j = await getJSON(`${NOMI}/reverse?format=jsonv2&zoom=14&accept-language=es&lat=${lat}&lon=${lon}`, null, 10000);
    const a = j.address || {};
    return a.village || a.town || a.city || a.hamlet || a.municipality || (j.display_name || '').split(',')[0] || null;
  } catch (e) { return null; }
}
