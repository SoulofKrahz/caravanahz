// Almacenamiento local en IndexedDB. Todos los datos se cargan en memoria al arrancar (son pocos)
// Cada cambio se escribe PRIMERO en disco y solo después en memoria: si el disco falla, la app no enseña
// como guardado algo que se perdería al cerrarla (el formulario muestra el error y no se cierra).

const NAME = 'caravanahz';
const VERSION = 1;
export const STORES = ['tasks', 'services', 'docs', 'expenses', 'trips', 'places', 'odo'];

let dbp;
function open() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = () => {
      const db = r.result;
      // Otra pestaña con una versión nueva necesita la base: cerramos y la próxima operación la reabre
      db.onversionchange = () => { db.close(); dbp = null; };
      db.onclose = () => { dbp = null; };
      res(db);
    };
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => {};
  }));
}
function tx1(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = t.onabort = () => rej(t.error || new Error('Operación cancelada'));
  }));
}
// Android puede cerrar la conexión si la app pasa mucho tiempo en segundo plano: se reabre y se reintenta una vez
async function tx(store, mode, fn) {
  try { return await tx1(store, mode, fn); }
  catch (e) {
    if (e && (e.name === 'InvalidStateError' || /closing|closed/i.test(e.message || ''))) { dbp = null; return tx1(store, mode, fn); }
    if (e && e.name === 'QuotaExceededError') throw new Error('el móvil no tiene espacio libre');
    throw e;
  }
}

/** Estado en memoria: D.tasks, D.services… (arrays) y D.kv (objeto) */
export const D = { kv: {} };
STORES.forEach(s => (D[s] = []));

export async function loadAll() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  for (const s of STORES) D[s] = await tx(s, 'readonly', st => st.getAll());
  const keys = await tx('kv', 'readonly', st => st.getAllKeys());
  const vals = await tx('kv', 'readonly', st => st.getAll());
  D.kv = {};
  keys.forEach((k, i) => (D.kv[k] = vals[i]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function put(store, obj) {
  if (!obj.id) obj.id = uid();
  obj.upd = Date.now();
  await tx(store, 'readwrite', st => st.put(obj));
  const arr = D[store], i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  return obj;
}
export async function del(store, id) {
  await tx(store, 'readwrite', st => st.delete(id));
  D[store] = D[store].filter(x => x.id !== id);
}
export async function setKV(key, val) {
  await tx('kv', 'readwrite', st => st.put(val, key));
  D.kv[key] = val;
}
export const getKV = (key, def) => (D.kv[key] === undefined ? def : D.kv[key]);

/** Copia completa (para exportar) */
export function dump() {
  const data = { kv: D.kv };
  STORES.forEach(s => (data[s] = D[s]));
  return data;
}

/** Sustituye todos los datos por los de una copia ya validada */
export async function restore(data) {
  const db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(['kv', ...STORES], 'readwrite');
    t.objectStore('kv').clear();
    Object.entries(data.kv || {}).forEach(([k, v]) => t.objectStore('kv').put(v, k));
    STORES.forEach(s => {
      const st = t.objectStore(s);
      st.clear();
      (data[s] || []).forEach(o => st.put(o));
    });
    t.oncomplete = res;
    t.onerror = t.onabort = () => rej(t.error);
  });
  await loadAll();
}

export async function wipe() {
  const db = await open();
  db.close();
  dbp = null;
  await new Promise(r => { const q = indexedDB.deleteDatabase(NAME); q.onsuccess = q.onerror = q.onblocked = () => r(); setTimeout(r, 1500); });
}
