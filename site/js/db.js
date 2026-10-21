// Almacenamiento local en IndexedDB. Todos los datos se cargan en memoria al arrancar (son pocos)
// y cada cambio se escribe a la vez en memoria y en disco.

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
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = t.onabort = () => rej(t.error);
  }));
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
  const arr = D[store], i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await tx(store, 'readwrite', st => st.put(obj));
  return obj;
}
export async function del(store, id) {
  D[store] = D[store].filter(x => x.id !== id);
  await tx(store, 'readwrite', st => st.delete(id));
}
export async function setKV(key, val) {
  D.kv[key] = val;
  await tx('kv', 'readwrite', st => st.put(val, key));
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
