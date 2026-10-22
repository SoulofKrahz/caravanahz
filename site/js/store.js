// Datos de referencia y cálculos compartidos entre módulos.
import { D, getKV, put, del, uid } from './db.js';
import { normKey } from './valid.js';
import { currentKm, kmRate, taskStatus, docStatus, isoToday, RANK } from './logic.js';

export const APP = 'Caravanahz';
export const VER = '2026-10-22-4';

export const ZONAS = ['Motor', 'Chasis y frenos', 'Neumáticos', 'Célula', 'Gas', 'Agua', 'Electricidad', 'Seguridad', 'Otros'];
export const ZONA_ICO = { Motor: 'gauge', 'Chasis y frenos': 'wrench', Neumáticos: 'gps', Célula: 'van', Gas: 'fuel', Agua: 'fuel', Electricidad: 'gauge', Seguridad: 'alert', Otros: 'wrench' };
export const CATS = ['Combustible', 'Peajes', 'Área / camping', 'Mantenimiento', 'Seguro', 'Impuestos y tasas', 'Equipamiento', 'Ferry', 'Otros'];
export const DOC_TIPOS = ['ITV', 'Seguro', 'Impuesto de circulación', 'Revisión de gas', 'Garantía', 'Carnet de conducir', 'Asistencia en carretera', 'Otro'];
export const STOP_TIPOS = [['visita', 'Visita'], ['area', 'Área AC (pernocta)'], ['camping', 'Camping (pernocta)'], ['libre', 'Pernocta libre'], ['repostaje', 'Repostaje / servicio']];
export const NIGHT = new Set(['area', 'camping', 'libre']);

import { PERFIL } from './perfil.js';
export const PLAN_BASE = PERFIL.plan;

/** Añade las tareas del plan de partida que falten (no duplica las que ya existen con el mismo nombre). Devuelve cuántas añadió. */
export const seedPlan = async () => {
  const have = new Set(D.tasks.map(t => normKey(t.nombre)));
  let n = 0;
  for (const [nombre, zona, intMeses, intKm, fuente, nota] of PLAN_BASE) {
    if (have.has(normKey(nombre))) continue;
    await put('tasks', { id: uid(), nombre, zona, intMeses, intKm, ultFecha: '', ultKm: '', notas: nota || '', fuente: fuente || '' }); n++;
  }
  return n;
};

/**
 * Migración desde el plan genérico de las versiones 0.1 y 0.2 al plan del Ducato 1.9 TD.
 * Solo toca las tareas que el usuario no haya personalizado (mismos intervalos que el genérico);
 * conserva la «última vez» y el historial (renombrando la tarea), y no duplica nada.
 */
const GENERIC_OLD = [
  ['Aceite y filtro de aceite', 12, 20000], ['Filtro de aire', 24, 40000], ['Filtro de combustible', 24, 40000], ['Filtro de habitáculo', 12, 20000],
  ['Correa de distribución / accesorios', 72, 120000], ['Líquido refrigerante', 48, 0], ['Líquido de frenos', 24, 0], ['Pastillas y discos (revisión)', 12, 20000],
  ['Presión de neumáticos', 1, 0], ['Sustitución de neumáticos (antigüedad)', 72, 0], ['Prueba de estanqueidad (humedades)', 12, 0], ['Juntas y claraboyas (revisión)', 12, 0],
  ['Latiguillos y regulador de gas', 60, 0], ['Desinfección de depósitos y circuito', 12, 0], ['Junta del WC químico (lubricar)', 6, 0], ['Batería de célula (revisión)', 6, 0],
  ['Extintor', 12, 0], ['Detector de gas / CO (pila)', 12, 0],
];
const RENAME = {
  'Filtro de combustible': 'Filtro de gasóleo (y purgar agua)', 'Correa de distribución / accesorios': 'Correa de distribución + tensor + bomba de agua',
  'Pastillas y discos (revisión)': 'Frenos delanteros y traseros (revisión)', 'Prueba de estanqueidad (humedades)': 'Prueba de estanqueidad con medidor de humedad',
  'Juntas y claraboyas (revisión)': 'Claraboyas, ventanas y juntas', 'Latiguillos y regulador de gas': 'Latiguillos de gas (fecha impresa)',
};
const isGenericUntouched = t => GENERIC_OLD.some(([n, m, k]) => normKey(n) === normKey(t.nombre) && +t.intMeses === m && +(t.intKm || 0) === k);
/** ¿Quedan tareas del plan genérico sin adaptar? */
export const needsProfilePlan = () => D.tasks.some(t => isGenericUntouched(t) && !PLAN_BASE.some(p => normKey(p[0]) === normKey(t.nombre) && p[2] === +t.intMeses && p[3] === +(t.intKm || 0)));
export async function applyProfilePlan() {
  let upd = 0, rem = 0;
  for (const t of D.tasks.slice()) {
    if (!isGenericUntouched(t)) continue;
    const target = RENAME[t.nombre] || t.nombre, p = PLAN_BASE.find(x => normKey(x[0]) === normKey(target));
    const hist = D.services.some(x => x.tareaId === t.id);
    if (!p) { if (!hist && !t.ultFecha && (t.ultKm === '' || t.ultKm == null)) { await del('tasks', t.id); rem++; } continue; }
    if (D.tasks.some(x => x.id !== t.id && normKey(x.nombre) === normKey(p[0]))) continue; // ya existe la nueva: no duplicar
    await put('tasks', { ...t, nombre: p[0], zona: p[1], intMeses: p[2], intKm: p[3], fuente: p[4], notas: t.notas || p[5] });
    for (const sv of D.services.filter(x => x.tareaId === t.id)) await put('services', { ...sv, nombre: p[0], zona: p[1] });
    upd++;
  }
  const add = await seedPlan();
  return { upd, rem, add };
}

export const vehicle = () => getKV('vehicle', {});
export const PREF_DEFAULTS = { warnDays: 30, warnKm: 1000, timeFactor: PERFIL.ritmo, theme: 'auto', fs: 1.12, simple: true, start: 'inicio', mapGray: false, reduceMotion: false, bkRemind: true, showNd: true, defStop: 'visita' };
export const prefs = () => Object.assign({}, PREF_DEFAULTS, getKV('prefs', {}));

/** Contexto común para calcular estados */
export function ctx() {
  const p = prefs();
  return { km: currentKm(D), rate: kmRate(D), today: isoToday(), warnDays: +p.warnDays || 30, warnKm: +p.warnKm || 1000 };
}

export function tasksWithStatus(c = ctx()) {
  return D.tasks.map(t => ({ t, s: taskStatus(t, c) }))
    .sort((a, b) => RANK[a.s.state] - RANK[b.s.state] || (a.s.when || '9999').localeCompare(b.s.when || '9999') || a.t.nombre.localeCompare(b.t.nombre));
}
export function docsWithStatus(c = ctx()) {
  return D.docs.map(d => ({ d, s: docStatus(d, c) }))
    .sort((a, b) => RANK[a.s.state] - RANK[b.s.state] || (a.d.vence || '9999').localeCompare(b.d.vence || '9999'));
}
/** Nº de avisos (vencidos + próximos) para el distintivo de la barra */
export function alertCount(c = ctx()) {
  return tasksWithStatus(c).filter(x => x.s.state === 'over' || x.s.state === 'soon').length +
    docsWithStatus(c).filter(x => x.s.state === 'over' || x.s.state === 'soon').length;
}
